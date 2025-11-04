import React, { useEffect, useMemo, useState } from "react";
import {
  Paper,
  Typography,
  Stack,
  Select,
  MenuItem,
  TextField,
  Button,
  Tooltip,
  CircularProgress,
  Box,
  Slider,
  FormControlLabel,
  Switch,
  Fade,
  styled,
} from "@mui/material";
import {
  forecast,
  diagnostics,
  ForecastReq,
  downloadForecastCsv,
} from "../lib/api";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
  ResponsiveContainer,
  Area,
} from "recharts";

// Styled tooltip (glassy gradient)
const StyledTooltip = styled(({ className, ...props }: any) => (
  <Tooltip
    {...props}
    classes={{ popper: className }}
    TransitionComponent={Fade}
    TransitionProps={{ timeout: 400 }}
    arrow
  />
))(() => ({
  [`& .MuiTooltip-tooltip`]: {
    background:
      "linear-gradient(135deg, rgba(0,77,64,0.95), rgba(0,121,107,0.95))",
    color: "#fff",
    padding: "14px 18px",
    borderRadius: "12px",
    maxWidth: 420,
    fontSize: "0.9rem",
    lineHeight: 1.5,
    boxShadow:
      "0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.15)",
  },
  [`& .MuiTooltip-arrow`]: { color: "rgba(0,77,64,0.9)" },
}));

type Pt = {
  ts: string;
  actual?: number;
  pred?: number;
  lower?: number;
  upper?: number;
};

export default function ModelingPage() {
  const [metric, setMetric] = useState<"energy" | "sessions">("energy");
  const [freq, setFreq] = useState<"H" | "D">("H");
  const [seasonal, setSeasonal] = useState<number>(24);
  const [horizon, setHorizon] = useState<number>(48);
  const [testSize, setTestSize] = useState<number>(48);
  const [busy, setBusy] = useState(false);
  const [fc, setFc] = useState<any>(null);
  const [acf, setAcf] = useState<number[]>([]);
  const [pacf, setPacf] = useState<number[]>([]);
  const [dataRange, setDataRange] = useState<number>(100);
  const [downsample, setDownsample] = useState<boolean>(false);
  const [downsampleRate, setDownsampleRate] = useState<number>(5);

  const tooltipProps = {
    placement: "top-start" as const,
    enterTouchDelay: 0,
    leaveTouchDelay: 120,
  };

  // Load diagnostics
  async function loadDiag() {
    const d = await diagnostics(metric, freq, null, 40);
    if (d?.ok) {
      setAcf(d.acf);
      setPacf(d.pacf);
    }
  }
  useEffect(() => {
    loadDiag();
  }, [metric, freq]);

  // Forecast
  async function runForecast() {
    setBusy(true);
    try {
      const body: ForecastReq = {
        metric,
        freq,
        seasonal_period: seasonal,
        horizon,
        test_size: testSize,
        auto_grid: true,
      };
      const res = await forecast(body);
      setFc(res);
    } catch (e) {
      console.error(e);
      alert("Forecast failed.");
    } finally {
      setBusy(false);
    }
  }

  // Download
  function downloadClientCsv() {
    const rows = fc?.forecast || [];
    const hdr = ["ts", "y_pred", "lower", "upper"];
    const csv = [hdr.join(",")]
      .concat(rows.map((r: any) => [r.ts, r.y_pred, r.lower, r.upper].join(",")))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "forecast_client.csv";
    a.click();
  }

  // Optimize data
  const optimizeData = (data: Pt[]): Pt[] => {
    if (!data.length) return data;
    const rangeStart = Math.floor(data.length * (1 - dataRange / 100));
    let filteredData = data.slice(rangeStart);
    if (downsample && downsampleRate > 1) {
      filteredData = filteredData.filter((_, idx) => idx % downsampleRate === 0);
    }
    return filteredData;
  };

  // Chart data
  const actualData: Pt[] = useMemo(() => {
    if (!fc) return [];
    const hist = (fc.history || []).map((d: any) => ({
      ts: new Date(d.ts).toISOString(),
      actual: d.y,
    }));
    const val = (fc.validation || []).map((d: any) => ({
      ts: new Date(d.ts).toISOString(),
      actual: d.y_true,
      pred: d.y_pred,
    }));
    const merged = [...hist, ...val];
    merged.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    return optimizeData(merged);
  }, [fc, dataRange, downsample, downsampleRate]);

  const forecastData: Pt[] = useMemo(() => {
    if (!fc) return [];
    const fut = (fc.forecast || []).map((d: any) => ({
      ts: new Date(d.ts).toISOString(),
      pred: d.y_pred,
      lower: d.lower,
      upper: d.upper,
    }));
    if (fc?.history?.length) {
      const lastHist = fc.history[fc.history.length - 1];
      fut.unshift({
        ts: new Date(lastHist.ts).toISOString(),
        actual: lastHist.y,
      });
    }
    fut.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    return optimizeData(fut);
  }, [fc, dataRange, downsample, downsampleRate]);

  const renderTooltip = (label: string, p: Record<string, any>) => {
    const unit = metric === "energy" ? "kWh" : "sessions";
    return (
      <div
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          border: "1px solid #ccc",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 12,
        }}
      >
        <div>
          <b>Timestamp:</b> {new Date(label).toLocaleString()}
        </div>
        {p.actual !== undefined && (
          <div>
            <b>Actual:</b> {p.actual.toFixed(4)} {unit}
          </div>
        )}
        {p.pred !== undefined && (
          <div>
            <b>Forecast:</b> {p.pred.toFixed(4)} {unit}
          </div>
        )}
        {p.lower !== undefined && p.upper !== undefined && (
          <div>
            <b>Confidence:</b> [{p.lower.toFixed(2)} – {p.upper.toFixed(2)}]
          </div>
        )}
      </div>
    );
  };

  const LoaderOverlay = () => (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: 300,
        width: "100%",
      }}
    >
      <CircularProgress size={60} />
    </Box>
  );

  return (
    <Box
      sx={{
        background: "linear-gradient(135deg, #f5f7fa 0%, #e0f7fa 100%)",
        minHeight: "100vh",
        py: 3,
        px: { xs: 1, sm: 3 },
      }}
    >
      <Stack spacing={3}>
        <Typography variant="h4" fontWeight={600} color="primary.main">
          Modeling & Forecast Dashboard
        </Typography>

        {/* CONFIG PANEL */}
        <Paper elevation={3} sx={{ p: 3, borderRadius: 3, bgcolor: "white" }}>
          <Typography variant="h6" mb={2}>
            ⚙️ Model Configuration
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems="center"
            flexWrap="wrap"
          >
            <StyledTooltip
              {...tooltipProps}
              title="Choose what you want to forecast — total energy consumed (kWh) or the number of charging sessions."
            >
              <Stack>
                <Typography variant="caption">Metric</Typography>
                <Select
                  size="small"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as any)}
                  sx={{ minWidth: 140, bgcolor: "#f9f9f9", borderRadius: 1 }}
                >
                  <MenuItem value="energy">Energy (kWh)</MenuItem>
                  <MenuItem value="sessions">Sessions</MenuItem>
                </Select>
              </Stack>
            </StyledTooltip>

            <StyledTooltip
              {...tooltipProps}
              title="Select how data points are grouped — Hourly (H) shows finer patterns, Daily (D) shows broader trends."
            >
              <Stack>
                <Typography variant="caption">Frequency</Typography>
                <Select
                  size="small"
                  value={freq}
                  onChange={(e) => setFreq(e.target.value as any)}
                  sx={{ minWidth: 140, bgcolor: "#f9f9f9", borderRadius: 1 }}
                >
                  <MenuItem value="H">Hourly</MenuItem>
                  <MenuItem value="D">Daily</MenuItem>
                </Select>
              </Stack>
            </StyledTooltip>

            <StyledTooltip
              {...tooltipProps}
              title="A seasonal period tells the model how often patterns repeat — e.g., 24 for daily cycles (each hour repeats daily)."
            >
              <Stack>
                <Typography variant="caption">Seasonal Period</Typography>
                <TextField
                  size="small"
                  type="number"
                  value={seasonal}
                  onChange={(e) => setSeasonal(parseInt(e.target.value || '0'))}
                  sx={{ width: 120, bgcolor: "#f9f9f9", borderRadius: 1 }}
                />
              </Stack>
            </StyledTooltip>

            <StyledTooltip
              {...tooltipProps}
              title="The number of future points to predict — e.g., forecasting the next 48 hours or days."
            >
              <Stack>
                <Typography variant="caption">Horizon</Typography>
                <TextField
                  size="small"
                  type="number"
                  value={horizon}
                  onChange={(e) => setHorizon(parseInt(e.target.value || '0'))}
                  sx={{ width: 120, bgcolor: "#f9f9f9", borderRadius: 1 }}
                />
              </Stack>
            </StyledTooltip>

            <StyledTooltip
              {...tooltipProps}
              title="The portion of data set aside to test how accurate your model is — higher values test the model more strictly."
            >
              <Stack>
                <Typography variant="caption">Test Size</Typography>
                <TextField
                  size="small"
                  type="number"
                  value={testSize}
                  onChange={(e) => setTestSize(parseInt(e.target.value || '0'))}
                  sx={{ width: 120, bgcolor: "#f9f9f9", borderRadius: 1 }}
                />
              </Stack>
            </StyledTooltip>

            <Button
              variant="contained"
              color="primary"
              onClick={runForecast}
              disabled={busy}
              sx={{
                textTransform: "none",
                borderRadius: 2,
                px: 3,
                py: 1,
                mt: { xs: 1, sm: 3 },
              }}
            >
              {busy ? "Running…" : "Run Forecast"}
            </Button>
          </Stack>
        </Paper>

        {/* CHARTS */}
        {busy ? (
          <LoaderOverlay />
        ) : (
          fc && (
            <>
              {/* Historical + Validation */}
              <StyledTooltip
                {...tooltipProps}
                title="This chart shows the actual past data (in blue) and how well the model performed on unseen validation data (in purple). The closer the lines, the better the model fits real behavior."
              >
                <Paper elevation={2} sx={{ p: 3, borderRadius: 3, bgcolor: "white" }}>
                  <Typography variant="h6" color="primary">
                    📊 Historical + Validation Data
                  </Typography>
                  <Box sx={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={actualData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="ts"
                          tick={{ fontSize: 10 }}
                          minTickGap={30}
                          tickFormatter={(v) =>
                            new Date(v).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                            })
                          }
                        />
                        <YAxis />
                        <RTooltip
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const p = payload.reduce(
                                (acc, cur) => ({
                                  ...acc,
                                  [cur.dataKey]: cur.value,
                                }),
                                {}
                              );
                              return renderTooltip(label, p);
                            }
                            return null;
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="actual"
                          name="Actual"
                          stroke="#1565c0"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="pred"
                          name="Validation"
                          stroke="#9c27b0"
                          strokeDasharray="5 5"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </StyledTooltip>

              {/* Forecast */}
              <StyledTooltip
                {...tooltipProps}
                title="The green line forecasts future demand, while the shaded region shows the confidence interval — the range where predictions are most likely to fall."
              >
                <Paper elevation={2} sx={{ p: 3, borderRadius: 3, bgcolor: "white" }}>
                  <Typography variant="h6" color="success.main">
                    🔮 Future Forecast
                  </Typography>
                  <Box sx={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={forecastData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="ts"
                          tick={{ fontSize: 10 }}
                          minTickGap={30}
                          tickFormatter={(v) =>
                            new Date(v).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                            })
                          }
                        />
                        <YAxis />
                        <RTooltip
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const p = payload.reduce(
                                (acc, cur) => ({
                                  ...acc,
                                  [cur.dataKey]: cur.value,
                                }),
                                {}
                              );
                              return renderTooltip(label, p);
                            }
                            return null;
                          }}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="upper" opacity={0.15} fill="#66bb6a" />
                        <Area type="monotone" dataKey="lower" opacity={0.15} fill="#ef5350" />
                        <Line
                          type="monotone"
                          dataKey="pred"
                          name="Forecast"
                          stroke="#2e7d32"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </StyledTooltip>

              {/* Metrics */}
              <StyledTooltip
                {...tooltipProps}
                title="MAE shows the average prediction error. RMSE penalizes large mistakes more. MAPE expresses accuracy in easy-to-read percentage — e.g., 90% means strong forecasting precision."
              >
                <Typography variant="body2" color="text.secondary">
                  📈 Validation — MAE: {fc.metrics.MAE.toFixed(3)}, RMSE:{" "}
                  {fc.metrics.RMSE.toFixed(3)}, MAPE: {fc.metrics.MAPE.toFixed(2)}%
                </Typography>
              </StyledTooltip>
            </>
          )
        )}

        {/* Diagnostics */}
        <StyledTooltip
          {...tooltipProps}
          title="ACF and PACF help uncover hidden correlations in time — ACF measures overall memory in the data, PACF isolates the direct influence of recent lags. Together they guide ARIMA model parameters."
        >
          <Paper elevation={2} sx={{ p: 3, borderRadius: 3, bgcolor: "white" }}>
            <Typography variant="h6" gutterBottom>
              🧠 Diagnostics (ACF / PACF)
            </Typography>
            <Typography variant="caption" display="block">
              ACF: {acf.slice(0, 20).map((v) => v.toFixed(2)).join(", ")}
            </Typography>
            <Typography variant="caption" display="block">
              PACF: {pacf.slice(0, 20).map((v) => v.toFixed(2)).join(", ")}
            </Typography>
          </Paper>
        </StyledTooltip>
      </Stack>
    </Box>
  );
}
