from __future__ import annotations

import io
import os
import json
import pickle
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.stattools import acf as sm_acf, pacf as sm_pacf
import concurrent.futures

# -------------------------------------------------------------------
# Paths / globals
# -------------------------------------------------------------------

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "data", "uploads")
MODEL_DIR = os.path.join(BASE_DIR, "model_store")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)

LATEST_CSV = os.path.join(DATA_DIR, "ACN-data.csv")
LATEST_FILLED_CSV = os.path.join(DATA_DIR, "ACN-data-filled.csv")  # optional external fill step
_LAST_FORECAST_DF: Optional[pd.DataFrame] = None


# -------------------------------------------------------------------
# FastAPI setup
# -------------------------------------------------------------------

app = FastAPI(title="EV Charging Station Demand Forecastinging API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # tighten for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------------------------------------------------
# Data helpers
# -------------------------------------------------------------------

def make_synthetic(n_rows: int = 150) -> pd.DataFrame:
    """
    Fallback synthetic raw session-level data if no ACN CSV exists.
    Shape is similar to ACN sessions so the rest of the pipeline still works.
    """
    rng = pd.date_range("2020-01-01", periods=n_rows, freq="H")
    df = pd.DataFrame({
        "connectionTime": rng,
        "disconnectTime": rng + pd.Timedelta(hours=2),
        "kWhDelivered": np.random.lognormal(mean=1.5, sigma=0.4, size=n_rows).round(3),
        "clusterID": "synthetic_cluster",
        "siteID": "synthetic",
        "sessionID": [f"sess-{i}" for i in range(n_rows)],
        "spaceID": "synthetic_space",
        "stationID": "synthetic_station",
        "timezone": "UTC",
        "userID": None,
        "userInputs": None,
        # keep some userInputs-like fields as null for structure
        "WhPerMile": None,
        "kWhRequested": None,
        "milesRequested": None,
        "minutesAvailable": None,
        "paymentRequired": None,
    })
    return df


def parse_acn_json(payload: dict) -> pd.DataFrame:
    """
    Parse ACN-Data JSON of the form:
      { "_meta": {...}, "_items": [ {...}, {...}, ... ] }

    We:
    - flatten all nested fields (including userInputs.*)
    - keep everything (no column is dropped)
    """
    if not isinstance(payload, dict) or "_items" not in payload:
        return pd.DataFrame()

    items = payload["_items"]
    df = pd.json_normalize(items, sep=".")

    meta = payload.get("_meta")
    if isinstance(meta, dict):
        for k, v in meta.items():
            df[f"_meta.{k}"] = v

    return df


def load_current_dataframe() -> pd.DataFrame:
    """
    Load the latest raw CSV for modeling/aggregation.
    If missing or broken, fall back to synthetic data.
    """
    if os.path.exists(LATEST_FILLED_CSV):
        try:
            return pd.read_csv(LATEST_FILLED_CSV)
        except Exception:
            return make_synthetic(150)
    return make_synthetic(150)


def load_raw_dataframe(path: str) -> pd.DataFrame:
    """
    Load a raw CSV file for /raw endpoints.
    No synthetic fallback: if missing/broken -> empty DataFrame.
    """
    if os.path.exists(path):
        try:
            return pd.read_csv(path)
        except Exception:
            return pd.DataFrame()
    return pd.DataFrame()


def _guess_timestamp_col(df: pd.DataFrame) -> Optional[str]:
    # Prefer standard names
    for cand in ("connectionTime", "timestamp", "ts", "start", "date"):
        if cand in df.columns:
            return cand
    # Fallback: any column containing "time" or "date"
    for c in df.columns:
        lc = c.lower()
        if "time" in lc or "date" in lc:
            return c
    return None


def _guess_energy_col(df: pd.DataFrame) -> Optional[str]:
    for cand in ("energy_kwh", "kWhDelivered", "kwh", "energy"):
        if cand in df.columns:
            return cand
    return None


def _guess_site_col(df: pd.DataFrame) -> Optional[str]:
    for cand in ("site", "siteID", "clusterID", "stationID"):
        if cand in df.columns:
            return cand
    return None


def build_hourly_daily(raw: pd.DataFrame, site: Optional[str], freq: str = "H") -> pd.DataFrame:
    """
    Build an hourly/daily aggregated time series from raw session data.

    Output includes:
    - energy_kwh (sum)
    - sessions (count)
    - WhPerMile, kWhRequested, milesRequested, minutesAvailable (mean over bucket, if present)
    - paid_sessions, identified_users (sum of indicators, if present)
    """
    if raw is None or raw.empty:
        return pd.DataFrame(columns=["energy_kwh", "sessions"])

    df = raw.copy()

    # 1) Timestamp
    ts_col = _guess_timestamp_col(df)
    if ts_col is None:
        return pd.DataFrame(columns=["energy_kwh", "sessions"])

    df["ts"] = pd.to_datetime(df[ts_col], errors="coerce")
    df = df.dropna(subset=["ts"])
    if df.empty:
        return pd.DataFrame(columns=["energy_kwh", "sessions"])

    # 2) Energy in kWh
    energy_col = _guess_energy_col(df)
    if energy_col is None:
        df["energy_kwh"] = 0.0
    else:
        s = pd.to_numeric(df[energy_col], errors="coerce")
        # if name implies Wh and not kWh, convert
        lc = energy_col.lower()
        if "wh" in lc and "kwh" not in lc:
            s = s / 1000.0
        df["energy_kwh"] = s.fillna(0.0)

    # 3) Site (for filtering)
    site_col = _guess_site_col(df)
    if site is not None and site_col is not None:
        df = df[df[site_col] == site]

    if df.empty:
        return pd.DataFrame(columns=["energy_kwh", "sessions"])

    # 4) Extra numeric features (from userInputs / columns on sessions)
    extra_cols: dict[str, pd.Series] = {}
    for col in ["WhPerMile", "kWhRequested", "milesRequested", "minutesAvailable"]:
        if col in df.columns:
            extra_cols[col] = pd.to_numeric(df[col], errors="coerce")

    # Binary-ish indicators (sum them for counts)
    if "paymentRequired" in df.columns:
        # attempt to interpret True/False/1/0
        extra_cols["paid_sessions"] = (
            df["paymentRequired"]
            .astype("float")   # bool→1.0/0.0, NaN stays NaN
            .fillna(0.0)
        )

    if "userID" in df.columns:
        extra_cols["identified_users"] = df["userID"].notna().astype(int)

    # 5) Build frame with one row per session
    base = {
        "ts": df["ts"],
        "energy_kwh": df["energy_kwh"],
        "sessions": 1,
    }
    for name, series in extra_cols.items():
        base[name] = series

    agg_df = pd.DataFrame(base)

    # 6) Aggregation per time bucket
    agg_dict: dict[str, str] = {
        "energy_kwh": "sum",
        "sessions": "sum",
    }
    for name in extra_cols.keys():
        if name in ("paid_sessions", "identified_users"):
            agg_dict[name] = "sum"
        else:
            agg_dict[name] = "mean"

    out = (
        agg_df
        .set_index("ts")
        .groupby(pd.Grouper(freq=freq))
        .agg(agg_dict)
        .sort_index()
    )
    out.index.name = "ts"
    return out


# -------------------------------------------------------------------
# Modeling helpers
# -------------------------------------------------------------------

class ForecastRequest(BaseModel):
    site: Optional[str] = None
    metric: str = "energy"       # "energy" or "sessions"
    freq: str = "H"              # "H" or "D"
    seasonal_period: int = 24
    horizon: int = 48
    test_size: int = 48
    auto_grid: bool = True
    order: Optional[tuple[int, int, int]] = None
    seasonal_order: Optional[tuple[int, int, int, int]] = None


def _select_series(df: pd.DataFrame, metric: str) -> pd.Series:
    if metric == "energy":
        col = "energy_kwh"
    elif metric == "sessions":
        col = "sessions"
    else:
        raise ValueError("metric must be 'energy' or 'sessions'")
    if col not in df.columns:
        raise ValueError(f"Required column '{col}' missing from aggregated data.")
    s = df[col].astype(float)
    s.name = col
    return s


def small_grid_search(endog: pd.Series, seasonal_period: int):
    """
    Very small SARIMA grid: p,d,q in {0,1,2}, seasonal P,D,Q in {0,1} if seasonal_period>1.
    Returns best (AIC) and a short list of candidates for explanation.
    """
    best = None
    pdqs = [(p, d, q) for p in range(0, 3) for d in (0, 1) for q in range(0, 3)]
    PDQs = [(0, 0, 0, 0)]
    if seasonal_period and seasonal_period > 1:
        PDQs = [(P, D, Q, seasonal_period)
                for P in range(0, 2) for D in (0, 1) for Q in range(0, 2)]

    for order in pdqs:
        for seasonal_order in PDQs:
            try:
                mod = SARIMAX(
                    endog,
                    order=order,
                    seasonal_order=seasonal_order if seasonal_order[-1] != 0 else (0, 0, 0, 0),
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                )
                res = mod.fit(disp=False)
                aic = res.aic
                if best is None or aic < best[0]:
                    best = (aic, order, seasonal_order)
            except Exception:
                continue
    if best is None:
        raise RuntimeError("Grid search failed. Try different settings or more data.")
    return best


def evaluate_np(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    mae = float(np.mean(np.abs(y_true - y_pred)))
    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))
    denom = np.maximum(1e-8, np.abs(y_true))
    mape = float(np.mean(np.abs((y_true - y_pred) / denom)) * 100.0)
    return {"MAE": mae, "RMSE": rmse, "MAPE": mape}


# -------------------------------------------------------------------
# Routes
# -------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    """
    Upload a CSV directly as raw ACN data. Nothing is dropped/renamed.
    """
    contents = await file.read()
    df = pd.read_csv(io.BytesIO(contents))
    if len(df) < 10:
        return {"ok": False, "message": "CSV seems too small."}
    df.to_csv(LATEST_FILLED_CSV, index=False)
    return {"ok": True, "rows": int(len(df)), "format": "csv"}


@app.post("/ingest-json")
async def ingest_json(payload: dict = Body(...)):
    """
    Ingest ACN JSON and flatten to ACN-data.csv.

    - Uses `_items` list.
    - Flattens userInputs, etc. into columns.
    - Attaches _meta.* as constant columns.
    """
    try:
        df = parse_acn_json(payload)
    except Exception as e:
        return {"ok": False, "message": f"Failed to parse JSON: {e}"}

    if df.empty:
        return {"ok": False, "message": "No _items found in JSON payload."}

    df.to_csv(LATEST_FILLED_CSV, index=False)
    return {
        "ok": True,
        "rows": int(len(df)),
        "columns": list(df.columns),
        "message": "Flattened JSON saved to ACN-data.csv",
        "format": "json",
    }


@app.get("/raw")
def get_raw(limit: int = 100):
    """
    Preview of ACN-data.csv (original flattened data).
    """
    df = load_raw_dataframe(LATEST_CSV)
    if df.empty:
        return {
            "ok": True,
            "total_rows": 0,
            "columns": [],
            "preview": [],
            "message": "No ACN-data.csv yet. Upload CSV or ingest JSON first.",
        }

    preview = json.loads(df.head(limit).to_json(orient="records"))
    return {
        "ok": True,
        "total_rows": int(len(df)),
        "columns": list(df.columns),
        "preview": preview,
        "source": "ACN-data.csv",
    }


@app.get("/raw_filled")
def get_raw_filled(limit: int = 100):
    """
    Preview of ACN-data-filled.csv (if you generate a forward-filled dataset externally).
    """
    df = load_raw_dataframe(LATEST_FILLED_CSV)
    if df.empty:
        return {
            "ok": True,
            "total_rows": 0,
            "columns": [],
            "preview": [],
            "message": "No ACN-data-filled.csv found. This is optional.",
        }

    preview = json.loads(df.head(limit).to_json(orient="records"))
    return {
        "ok": True,
        "total_rows": int(len(df)),
        "columns": list(df.columns),
        "preview": preview,
        "source": "ACN-data-filled.csv",
    }


@app.get("/clean")
def get_clean(site: Optional[str] = None, freq: str = "H", limit: int = 200):
    """
    Aggregated hourly/daily series, plus info on missing values in raw data.
    Handles NaN/Inf values safely for JSON serialization.
    """
    raw = load_current_dataframe()
    before_rows = int(len(raw))

    agg = build_hourly_daily(raw, site=site, freq=freq)
    after_rows = int(len(agg))

    null_counts = raw.isna().sum().sort_values(ascending=False).to_dict()

    if agg.empty:
        msg = (
            f"Could not build aggregated series. "
            f"Check that timestamps and kWhDelivered/energy columns exist. "
            f"Raw rows: {before_rows}."
        )
        preview: list[dict] = []
    else:
        msg = (
            f"Data successfully aggregated at **{('Daily' if freq == 'D' else 'Hourly')}** frequency "
            f"for site **'{site or 'default'}'**.\n\n"
            f"- Original data contained **{before_rows:,} session records**.\n"
            f"- After grouping and cleaning, **{after_rows:,} aggregated time buckets** were generated.\n"
            f"- Missing or invalid timestamps were automatically removed.\n"
            f"- Non-numeric or infinite values (e.g., 'NaN', 'Inf') were safely replaced with nulls.\n"
            f"- The preview below shows the first {limit} rows of the cleaned dataset."
        )

        # Take limited rows for preview
        preview_df = agg.reset_index().head(limit)

        # Replace inf values with NaN
        preview_df = preview_df.replace([np.inf, -np.inf], np.nan)

        # Convert to JSON-safe structure (NaN → null)
        preview = json.loads(preview_df.to_json(orient="records"))

    return {
        "ok": True,
        "message": msg,
        "null_counts": null_counts,
        "preview": preview,
    }



@app.get("/diagnostics")
def diagnostics(metric: str = "energy", site: Optional[str] = None,
                freq: str = "H", nlags: int = 40):
    """
    ACF/PACF diagnostics on the aggregated series.
    Safe against NaN/inf values and updated for latest statsmodels API.
    """
    raw = load_current_dataframe()
    agg = build_hourly_daily(raw, site=site, freq=freq)

    if agg.empty:
        return {"ok": False, "message": "No aggregated data available for diagnostics."}

    s = _select_series(agg, metric).dropna().astype(float)
    if len(s) < 10:
        return {"ok": False, "message": "Not enough data for diagnostics.", "series_length": len(s)}

    nlags = min(nlags, max(5, len(s) // 3))

    # Compute ACF/PACF safely
    acf_raw = sm_acf(s, nlags=nlags, fft=True)
    pacf_raw = sm_pacf(s, nlags=nlags, method="yw")

    # Clean NaN/Inf for JSON safety
    def _clean(arr):
        return [
            None if (pd.isna(x) or np.isinf(x)) else float(x)
            for x in arr
        ]

    acf_vals = _clean(acf_raw)
    pacf_vals = _clean(pacf_raw)

    return {
        "ok": True,
        "lags": nlags,
        "acf": acf_vals,
        "pacf": pacf_vals,
        "series_length": len(s)
    }


@app.get("/series")
def get_series(site: Optional[str] = None, freq: str = "H"):
    """
    Aggregated time series for plotting (only energy_kwh & sessions).
    """
    raw = load_current_dataframe()
    agg = build_hourly_daily(raw, site=site, freq=freq)

    if agg.empty:
        return {"ok": False, "message": "No aggregated series available."}

    return {
        "ok": True,
        "freq": freq,
        "site": site or "default",
        "series": [
            {
                "ts": str(ts),
                "energy_kwh": float(row["energy_kwh"]),
                "sessions": int(row["sessions"]),
            }
            for ts, row in agg.iterrows()
        ],
    }

@app.post("/forecast")
def forecast(req: ForecastRequest):
    """
    Fit SARIMAX on aggregated series and forecast.
    Optimized for responsiveness: includes grid cap + timeout + fallback.
    """
    global _LAST_FORECAST_DF

    raw = load_current_dataframe()
    agg = build_hourly_daily(raw, site=req.site, freq=req.freq)

    if agg.empty:
        return {"ok": False, "message": "No aggregated data available for forecasting."}

    series = _select_series(agg, req.metric).dropna()
    if len(series) < 20:
        return {"ok": False, "message": "Not enough data points for forecasting.", "series_length": len(series)}

    # Adjust short series
    if len(series) < max(50, req.horizon + req.test_size + 5):
        req.test_size = min(req.test_size, max(12, len(series) // 5))
        req.horizon = min(req.horizon, max(12, len(series) // 6))

    y = series
    if req.test_size >= len(y) // 2:
        req.test_size = max(12, len(y) // 5)

    y_train = y.iloc[:-req.test_size] if req.test_size > 0 else y
    y_test = y.iloc[-req.test_size:] if req.test_size > 0 else pd.Series([], dtype=float)

    # -----------------------------------------------------
    # Main model logic (runs in thread with timeout)
    # -----------------------------------------------------
    def _run_model():
        # Use simpler model for small data
        if len(y_train) < 100:
            order, seasonal_order = (1, 1, 1), (0, 0, 0, 0)
        elif req.auto_grid:
            # Small safe grid
            best_aic, best_order, best_seasonal = np.inf, None, (0, 0, 0, 0)
            for order in [(1, 1, 1), (2, 1, 1), (1, 0, 1), (0, 1, 1)]:
                try:
                    mod = SARIMAX(
                        y_train,
                        order=order,
                        seasonal_order=(0, 0, 0, 0),
                        enforce_stationarity=False,
                        enforce_invertibility=False,
                    )
                    res = mod.fit(disp=False)
                    if res.aic < best_aic:
                        best_aic, best_order = res.aic, order
                except Exception:
                    continue
            order, seasonal_order = best_order or (1, 1, 1), (0, 0, 0, 0)
        else:
            order = tuple(req.order or (1, 1, 1))
            seasonal_order = tuple(req.seasonal_order or (0, 0, 0, 0))

        # Fit model
        try:
            mod = SARIMAX(
                y_train,
                order=order,
                seasonal_order=seasonal_order if seasonal_order[-1] != 0 else (0, 0, 0, 0),
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            res = mod.fit(disp=False)
        except Exception as e:
            # fallback to naive forecast
            fut_idx = pd.date_range(y.index[-1] + pd.tseries.frequencies.to_offset(req.freq),
                                    periods=req.horizon, freq=req.freq)
            last_val = float(y.iloc[-1])
            trend = (y.iloc[-1] - y.iloc[-min(5, len(y)//2)]) / max(1, min(5, len(y)//2))
            fut = pd.DataFrame({"ts": fut_idx, "y_pred": last_val + trend * np.arange(1, req.horizon + 1)})
            fut["lower"] = fut["y_pred"] * 0.9
            fut["upper"] = fut["y_pred"] * 1.1
            return {"fallback": True, "forecast_df": fut, "order": (0,0,0), "seasonal_order": (0,0,0,0)}

        # Validation
        metrics = None
        val_df = None
        if len(y_test) > 0:
            fc_val = res.get_forecast(steps=len(y_test))
            val_pred = fc_val.predicted_mean.values
            metrics = evaluate_np(y_test.values, val_pred)
            val_df = pd.DataFrame({"ts": y_test.index, "y_true": y_test.values, "y_pred": val_pred})

        # Future forecast
        fc = res.get_forecast(steps=req.horizon)
        fc_mean = fc.predicted_mean
        ci = fc.conf_int(alpha=0.2)
        ci.columns = ["lower", "upper"]
        fut_idx = pd.date_range(y.index[-1] + pd.tseries.frequencies.to_offset(req.freq),
                                periods=req.horizon, freq=req.freq)
        fut = pd.DataFrame({"ts": fut_idx, "y_pred": fc_mean.values}).join(ci.reset_index(drop=True))
        return {"res": res, "forecast_df": fut, "val_df": val_df, "metrics": metrics,
                "order": order, "seasonal_order": seasonal_order}

    # Run model with timeout (20 s max)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_run_model)
        try:
            result = future.result(timeout=20)
        except concurrent.futures.TimeoutError:
            return {"ok": False, "message": "Forecasting timed out. Try smaller horizon or disable auto_grid."}

    # -----------------------------------------------------
    # Assemble response
    # -----------------------------------------------------
    if result.get("fallback"):
        fut = result["forecast_df"]
        order, seasonal_order = result["order"], result["seasonal_order"]
        metrics, val_df = None, None
    else:
        fut = result["forecast_df"]
        order, seasonal_order = result["order"], result["seasonal_order"]
        metrics, val_df = result.get("metrics"), result.get("val_df")

    hist = pd.DataFrame({"ts": y.index, "y": y.values})

    # Save CSV in memory for download
    fut_out = fut.copy()
    fut_out.insert(0, "metric", req.metric)
    fut_out.insert(1, "freq", req.freq)
    _LAST_FORECAST_DF = fut_out

    model_id = f"{req.metric}_{req.freq}_{order}_{seasonal_order}".replace(" ", "")
    return {
        "ok": True,
        "model_id": model_id,
        "order": order,
        "seasonal_order": seasonal_order,
        "metric": req.metric,
        "freq": req.freq,
        "horizon": req.horizon,
        "test_size": req.test_size,
        "metrics": metrics,
        "history": [{"ts": str(r.ts), "y": float(r.y)} for r in hist.itertuples(index=False)],
        "validation": None if val_df is None else [
            {"ts": str(r.ts), "y_true": float(r.y_true), "y_pred": float(r.y_pred)}
            for r in val_df.itertuples(index=False)
        ],
        "forecast": [
            {"ts": str(r.ts), "y_pred": float(r.y_pred),
             "lower": float(r.lower), "upper": float(r.upper)}
            for r in fut.itertuples(index=False)
        ],
    }

@app.get("/download/forecast.csv")
def download_forecast_csv():
    global _LAST_FORECAST_DF
    if _LAST_FORECAST_DF is None or _LAST_FORECAST_DF.empty:
        return JSONResponse(
            {"ok": False, "message": "No forecast available yet."},
            status_code=400,
        )
    csv_bytes = _LAST_FORECAST_DF.to_csv(index=False).encode("utf-8")
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=forecast.csv"},
    )
