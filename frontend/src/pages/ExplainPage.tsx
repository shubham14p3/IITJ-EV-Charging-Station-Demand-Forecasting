import React from "react";
import {
  Paper,
  Typography,
  Stack,
  Tooltip,
  Box,
  Fade,
  styled,
} from "@mui/material";

// 🌟 Custom Styled Tooltip (Glassy Gradient Theme)
const StyledTooltip = styled(({ className, ...props }: any) => (
  <Tooltip
    {...props}
    classes={{ popper: className }}
    TransitionComponent={Fade}
    TransitionProps={{ timeout: 400 }}
    arrow
  />
))(({ theme }) => ({
  [`& .MuiTooltip-tooltip`]: {
    background:
      "linear-gradient(135deg, rgba(0,77,64,0.95) 0%, rgba(0,121,107,0.95) 100%)",
    color: "#fff",
    padding: "14px 18px",
    borderRadius: "12px",
    maxWidth: 420,
    fontSize: "0.88rem",
    lineHeight: 1.5,
    boxShadow:
      "0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.15)",
  },
  [`& .MuiTooltip-arrow`]: {
    color: "rgba(0,77,64,0.9)",
  },
}));

export default function ExplainPage() {
  const tooltipProps = {
    placement: "top-start" as const,
    enterTouchDelay: 0,
    leaveTouchDelay: 120,
    PopperProps: {
      modifiers: [
        {
          name: "preventOverflow",
          enabled: true,
          options: { boundary: "viewport" },
        },
      ],
    },
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={600}>
        Project Overview: EV Charging Station Demand Forecasting
      </Typography>

      {/* Objective */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          🎯 Objective
        </Typography>
        <Typography variant="body2">
          Forecast electricity consumption and session demand for Electric Vehicle (EV)
          charging stations using advanced time series modeling. This assists operators
          in optimizing load distribution and future planning.
        </Typography>
      </Paper>

      {/* Technologies */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          ⚙️ Technologies and Tools
        </Typography>
        <Typography variant="body2">
          <b>Frontend:</b> React (TypeScript), Material UI, Recharts, and Highcharts.<br />
          <b>Backend:</b> FastAPI (Python) with asynchronous data processing.<br />
          <b>Modeling:</b> SARIMAX from <code>statsmodels</code> for time series forecasting.<br />
          <b>Data Handling:</b> Pandas, NumPy for aggregation and cleaning.<br />
          <b>Validation:</b> MAE, RMSE, and MAPE metrics.<br />
          <b>Deployment:</b> Compatible with cPanel and Render cloud.
        </Typography>
      </Paper>

      {/* Backend API */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          🧠 Backend API Design (FastAPI)
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Each API endpoint automates one step in the EV data pipeline:
        </Typography>

        <Box sx={{ ml: 2 }}>
          <StyledTooltip
            {...tooltipProps}
            title={
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  /ingest-json → Flatten ACN Data
                </Typography>
                This endpoint ingests JSON data from the ACN API, extracts nested fields
                (like <code>userInputs.kWhRequested</code>) using{" "}
                <code>pandas.json_normalize()</code>, and converts it into a flat, tabular
                CSV (<code>ACN-data.csv</code>). This ensures downstream compatibility
                with Pandas aggregation and forecasting workflows.
              </>
            }
          >
            <Box sx={{ cursor: "help", my: 0.8 }}>
              • <b>/ingest-json:</b> Flatten and save ACN JSON.
            </Box>
          </StyledTooltip>

          <StyledTooltip
            {...tooltipProps}
            title={
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  /clean → Aggregation & Data Integrity
                </Typography>
                Converts raw EV session-level data into aggregated hourly or daily time
                series. Automatically detects timestamp, site, and energy columns; coerces
                datatypes; and calculates totals and averages for metrics like
                <code>energy_kwh</code>, <code>sessions</code>, and
                <code>WhPerMile</code>. Handles NaN and Inf values gracefully to preserve
                dataset consistency.
              </>
            }
          >
            <Box sx={{ cursor: "help", my: 0.8 }}>
              • <b>/clean:</b> Aggregate and clean data.
            </Box>
          </StyledTooltip>

          <StyledTooltip
            {...tooltipProps}
            title={
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  /diagnostics → Statistical Insight
                </Typography>
                Computes ACF (AutoCorrelation Function) and PACF (Partial
                AutoCorrelation Function) to identify lag dependencies in the time
                series. These diagnostics guide the choice of AR (p) and MA (q)
                parameters for the SARIMA model. Missing or infinite values are
                handled for JSON-safe output to render ACF/PACF charts in the UI.
              </>
            }
          >
            <Box sx={{ cursor: "help", my: 0.8 }}>
              • <b>/diagnostics:</b> Generate ACF/PACF for parameter tuning.
            </Box>
          </StyledTooltip>

          <StyledTooltip
            {...tooltipProps}
            title={
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  /forecast → SARIMAX Forecasting Engine
                </Typography>
                The forecasting endpoint trains a SARIMAX model on cleaned time series
                data. It performs a constrained grid search across (p, d, q) and (P, D, Q, s)
                combinations, selecting the lowest-AIC model. Returns predicted future
                values, 80% confidence intervals, and evaluation metrics (MAE, RMSE, MAPE).
                Includes timeout handling and fallback linear forecasting for stability.
              </>
            }
          >
            <Box sx={{ cursor: "help", my: 0.8 }}>
              • <b>/forecast:</b> Run SARIMAX forecast with auto grid.
            </Box>
          </StyledTooltip>

          <StyledTooltip
            {...tooltipProps}
            title={
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  /download/forecast.csv → Export Results
                </Typography>
                Provides a downloadable CSV containing timestamps, predicted values, and
                confidence intervals from the most recent forecast. Useful for sharing
                insights or performing external analysis in Excel or Tableau.
              </>
            }
          >
            <Box sx={{ cursor: "help", my: 0.8 }}>
              • <b>/download/forecast.csv:</b> Download forecast results.
            </Box>
          </StyledTooltip>
        </Box>
      </Paper>

      {/* SARIMAX Model */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          📈 Forecasting Model: SARIMAX
        </Typography>
        <StyledTooltip
          {...tooltipProps}
          title={
            <>
              SARIMAX (Seasonal AutoRegressive Integrated Moving Average with
              Exogenous variables) extends ARIMA by capturing both trend and seasonality.
              It predicts demand patterns (hourly/daily) and adjusts for weekly cycles.
              In our project, the seasonal period is set to 24 for hourly or 7 for daily data.
            </>
          }
        >
          <Typography variant="body2" sx={{ cursor: "help" }}>
            Hover to learn how SARIMAX models trends, seasonality, and residuals.
          </Typography>
        </StyledTooltip>
      </Paper>

      {/* Model Evaluation with Tooltip */}
      <Paper sx={{ p: 2 }}>
        <StyledTooltip
          {...tooltipProps}
          title={
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                📊 Model Evaluation – Understanding the Metrics
              </Typography>
              <b>MAE (Mean Absolute Error):</b> Measures the average magnitude of errors
              between predicted and actual values, without considering direction. Lower
              MAE means predictions are closer to true values.<br /><br />
              <b>RMSE (Root Mean Squared Error):</b> Penalizes larger errors more heavily.
              It’s useful when you care more about large deviations. Smaller RMSE implies
              more stable forecasts.<br /><br />
              <b>MAPE (Mean Absolute Percentage Error):</b> Expresses errors as a
              percentage of actual values, making it easier to interpret accuracy in
              real-world terms (e.g., “Our forecast is 92% accurate”).<br /><br />
              These metrics are shown next to forecast plots to help users visually
              and statistically evaluate model performance.
            </>
          }
        >
          <Box sx={{ cursor: "help" }}>
            <Typography variant="subtitle1" fontWeight={600}>
              📊 Model Evaluation
            </Typography>
            <Typography variant="body2">
              The system computes:
              <ul>
                <li><b>MAE</b> – Average absolute deviation.</li>
                <li><b>RMSE</b> – Penalizes large forecast errors.</li>
                <li><b>MAPE</b> – Expresses error in % form for interpretability.</li>
              </ul>
              These metrics are shown alongside forecast plots for clarity.
            </Typography>
          </Box>
        </StyledTooltip>
      </Paper>

      {/* Frontend */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          💻 Frontend Functionality
        </Typography>
        <Typography variant="body2">
          Built using React and Material UI, with dedicated pages for Upload, Cleaning,
          Modeling, and Explain. Charts and tables update dynamically and stay responsive.
        </Typography>
      </Paper>

      {/* Team */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          👩‍💻 Project Contributors
        </Typography>
        <Typography variant="body2">
          <b>Kanishka Dhindhwal (M24DE3043)</b><br />
          <b>Shubham Raj (M24DE3076)</b><br />
          <b>Shivam Mathur (M24DE3075)</b><br /><br />
          Subject: <b>Time Series Analysis (MAL7430)</b><br />
          Instructor: <b>Ganesh Manjhi</b><br />
          Indian Institute of Technology Jodhpur
        </Typography>
      </Paper>
    </Stack>
  );
}
