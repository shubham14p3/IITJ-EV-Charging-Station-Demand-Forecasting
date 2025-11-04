from __future__ import annotations
import pandas as pd
import numpy as np
from typing import Optional, Tuple

TIMESTAMP_HINTS = [
    "time", "timestamp", "datetime", "date",
    "start", "end", "connection", "disconnect", "sessionstart", "sessionend"
]
ENERGY_HINTS = ["kwh", "energy", "kwhdelivered", "wh"]
SITE_HINTS = ["site", "station", "site_name", "location", "siteid", "stationid"]

def _find_col(df: pd.DataFrame, hints: list[str]) -> Optional[str]:
    for c in df.columns:
        lc = c.lower()
        for h in hints:
            if h in lc:
                return c
    return None

def detect_columns(df: pd.DataFrame) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    energy_col = None
    for c in df.columns:
        lc = c.lower()
        if any(h in lc for h in ENERGY_HINTS):
            energy_col = c
            break

    timestamp_col = None
    for c in df.columns:
        lc = c.lower()
        if "timestamp" in lc or "datetime" in lc:
            timestamp_col = c
            break
    if timestamp_col is None:
        for c in df.columns:
            lc = c.lower()
            if "time" in lc or "date" in lc:
                if str(df[c].dtype) in ("object","string") or "datetime" in str(df[c].dtype):
                    timestamp_col = c
                    break

    start_col = _find_col(df, ["start","connection","connect"])
    end_col   = _find_col(df, ["end","disconnect","disconnecttime","sessionend"])
    return timestamp_col, start_col, end_col, energy_col

def coerce_times(df: pd.DataFrame, col: str) -> pd.Series:
    return pd.to_datetime(df[col], errors="coerce", utc=True).dt.tz_convert(None)

def coerce_energy(df: pd.DataFrame, col: str) -> pd.Series:
    s = pd.to_numeric(df[col], errors="coerce")
    lc = col.lower()
    if "wh" in lc and "kwh" not in lc:
        s = s / 1000.0
    s.name = "energy_kwh"
    return s

def add_site(df: pd.DataFrame) -> pd.Series:
    site_col = None
    for h in SITE_HINTS:
        for c in df.columns:
            if h in c.lower():
                site_col = c
                break
        if site_col:
            break
    if site_col is None:
        return pd.Series(["default"] * len(df), name="site")
    return df[site_col].fillna("default").astype(str)

def build_hourly_daily(df: pd.DataFrame, site: Optional[str], freq: str = "H") -> pd.DataFrame:
    assert freq in ("H","D")
    ts_col, start_col, end_col, energy_col = detect_columns(df.copy())

    if ts_col:
        ts = coerce_times(df, ts_col)
    elif end_col:
        ts = coerce_times(df, end_col)
    elif start_col:
        ts = coerce_times(df, start_col)
    else:
        raise ValueError("No timestamp/start/end column found; map columns explicitly in your CSV/JSON.")

    if energy_col:
        energy = coerce_energy(df, energy_col)
    else:
        energy = pd.Series(np.zeros(len(df)), name="energy_kwh")

    sites = add_site(df)

    agg = pd.DataFrame({
        "ts": ts,
        "energy_kwh": energy.fillna(0.0),
        "site": sites,
        "sessions": 1
    }).dropna(subset=["ts"])

    if site:
        agg = agg[agg["site"] == site]

    out = agg.set_index("ts").groupby([pd.Grouper(freq=freq)]).agg({
        "energy_kwh": "sum",
        "sessions": "sum"
    }).sort_index()
    out.index.name = "ts"
    return out

def make_synthetic(n_days: int = 120, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2023-01-01", periods=n_days*24, freq="H")

    daily  = 3 + 2*np.sin(2*np.pi*(idx.hour/24.0 - 0.25))
    weekly = 1 + 0.5*np.sin(2*np.pi*(idx.dayofweek/7.0))
    trend  = np.linspace(0, 1.5, len(idx))
    energy = np.maximum(0, 2 + daily + weekly + trend + rng.normal(0, 0.6, len(idx)))
    sessions = np.maximum(0, rng.poisson(energy/2.5)).astype(int)

    return pd.DataFrame({
        "timestamp": idx,
        "energy_kwh": energy,
        "sessions": sessions,
        "site": "default"
    })

def parse_acn_json(acn: dict) -> pd.DataFrame:
    items = acn.get("_items", [])
    if not isinstance(items, list) or len(items) == 0:
        return pd.DataFrame()

    rows = []
    for it in items:
        rows.append({
            "connectionTime": it.get("connectionTime"),
            "disconnectTime": it.get("disconnectTime"),
            "kWhDelivered": it.get("kWhDelivered"),
            "siteID": it.get("siteID"),
            "stationID": it.get("stationID"),
            "sessionID": it.get("sessionID"),
        })
    df = pd.DataFrame(rows)
    df.rename(columns={
        "kWhDelivered":"kWhDelivered",
        "connectionTime":"connectionTime",
        "disconnectTime":"disconnectTime",
        "siteID":"siteID",
        "stationID":"stationID"
    }, inplace=True)
    return df
