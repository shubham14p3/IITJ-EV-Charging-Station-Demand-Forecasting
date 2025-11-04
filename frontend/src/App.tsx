import React, { useEffect } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
  Link,
  Stack,
} from "@mui/material";
import GitHubIcon from "@mui/icons-material/GitHub";
import LinkedInIcon from "@mui/icons-material/LinkedIn";

import LoginPage from "./pages/LoginPage";
import RawDataPage from "./pages/RawDataPage";
import CleaningPage from "./pages/CleaningPage";
import ModelingPage from "./pages/ModelingPage";
import ExplainPage from "./pages/ExplainPage";
import RawDataFilledPage from "./pages/RawDataFilledPage";
import Page404 from "./pages/Page404";

// -------------------------
// Authentication helper
// -------------------------
function useAuth() {
  return !!localStorage.getItem("ev_auth");
}

// -------------------------
// Protected Route Wrapper
// -------------------------
function Protected({ children }: { children: React.ReactNode }) {
  const authed = useAuth();
  const loc = useLocation();
  if (!authed) return <Navigate to="/login" state={{ from: loc }} replace />;
  return <>{children}</>;
}

// -------------------------
// Navigation Bar
// -------------------------
function NavBar() {
  const navigate = useNavigate();
  const authed = useAuth();
  const userInfo = localStorage.getItem("ev_user");
  const user = userInfo ? JSON.parse(userInfo) : null;

  return (
    <AppBar
      position="fixed"
      sx={{
        background: "linear-gradient(90deg, #00695c, #00897b)",
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar sx={{ gap: 1, flexWrap: "wrap", width: "100%" }}>
        <Typography
          variant="h6"
          sx={{ flexGrow: 1, cursor: "pointer", fontWeight: 600 }}
          onClick={() => navigate("/")}
        >
          ⚡ EV Charging Station Demand Forecasting
        </Typography>

        {authed ? (
          <>
            <Button color="inherit" onClick={() => navigate("/raw")}>
              Raw Data
            </Button>
            <Button color="inherit" onClick={() => navigate("/raw-filled")}>
              Raw Filled Data
            </Button>
            <Button color="inherit" onClick={() => navigate("/clean")}>
              Cleaning
            </Button>
            <Button color="inherit" onClick={() => navigate("/model")}>
              Modeling
            </Button>
            <Button color="inherit" onClick={() => navigate("/explain")}>
              Explain
            </Button>

            {/* ✅ Display logged-in user */}
            {user && (
              <Typography
                variant="body2"
                sx={{
                  mx: 2,
                  px: 1.5,
                  py: 0.3,
                  borderRadius: 1,
                  fontWeight: 500,
                  backgroundColor: "rgba(255,255,255,0.15)",
                }}
              >
                You are logged in as <b>{user.name}</b> ({user.id})
              </Typography>
            )}

            <Button
              color="inherit"
              onClick={() => {
                localStorage.removeItem("ev_auth");
                localStorage.removeItem("ev_user");
                navigate("/login");
              }}
            >
              Logout
            </Button>
          </>
        ) : (
          <Button color="inherit" onClick={() => navigate("/login")}>
            Login
          </Button>
        )}
      </Toolbar>
    </AppBar>
  );
}

// -------------------------
// Footer Component
// -------------------------
function Footer() {
  return (
    <AppBar
      position="fixed"
      sx={{
        top: "auto",
        bottom: 0,
        background: "linear-gradient(90deg, #004d40, #00695c)",
        color: "#fff",
        height: 56,
        justifyContent: "center",
      }}
    >
      <Toolbar
        sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}
      >
        <Typography variant="body1" fontWeight={600}>
          ⚡ EV Charging Station Demand Forecasting System
        </Typography>

        <Stack direction="row" spacing={3} alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Shubham Raj (M24DE3076)</Typography>
            <Link
              href="https://github.com/shubham14p3"
              target="_blank"
              color="inherit"
            >
              <GitHubIcon fontSize="small" />
            </Link>
            <Link
              href="https://linkedin.com/in/shubham14p3"
              target="_blank"
              color="inherit"
            >
              <LinkedInIcon fontSize="small" />
            </Link>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Kanishka Dhindhwal (M24DE3043)</Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Shivam Mathur (M24DE3075)</Typography>
          </Stack>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}

// -------------------------
// Main App with Routes
// -------------------------
export default function App() {
  const loc = useLocation();

  // Auto logout when visiting /login
  useEffect(() => {
    if (loc.pathname === "/login") {
      localStorage.removeItem("ev_auth");
      localStorage.removeItem("ev_user");
    }
  }, [loc.pathname]);

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <NavBar />
      <Container
        maxWidth="xl"
        sx={{
          flex: 1,
          py: 10,
          pb: 10,
          overflow: "auto",
        }}
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Protected><RawDataPage /></Protected>} />
          <Route path="/raw" element={<Protected><RawDataPage /></Protected>} />
          <Route path="/raw-filled" element={<Protected><RawDataFilledPage /></Protected>} />
          <Route path="/clean" element={<Protected><CleaningPage /></Protected>} />
          <Route path="/model" element={<Protected><ModelingPage /></Protected>} />
          <Route path="/explain" element={<Protected><ExplainPage /></Protected>} />
          {/* ✅ Custom 404 Page */}
          <Route path="*" element={<Page404 />} />
        </Routes>
      </Container>
      <Footer />
    </Box>
  );
}
