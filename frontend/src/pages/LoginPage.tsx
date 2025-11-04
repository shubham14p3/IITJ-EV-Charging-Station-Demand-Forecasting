import React, { useState } from "react";
import {
  Box,
  Button,
  Typography,
  Card,
  TextField,
  Alert,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";

export default function LoginPage() {
  const [step, setStep] = useState(0); // 0: Login, 1: Welcome Screen
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [error, setError] = useState(false);

  const navigate = useNavigate();
  const loc = useLocation() as any;

  const validCredentials = [
    { id: "ADMIN", password: "ADMIN" },
    { id: "M24DE3043", password: "M24DE3043" }, // Kanishka
    { id: "M24DE3075", password: "M24DE3075" }, // Shivam
    { id: "M24DE3076", password: "M24DE3076" }, // Shubham
  ];

  const handleLogin = () => {
    const id = loginId.trim().toUpperCase();
    const pwd = loginPassword.trim().toUpperCase();

    const isValid = validCredentials.some(
      (cred) => cred.id === id && cred.password === pwd
    );

    if (isValid) {
      localStorage.setItem("ev_auth", "1");
      setStep(1);
      setError(false);
    } else {
      setError(true);
    }
  };

  const handleStart = () => {
    navigate(loc?.state?.from?.pathname || "/");
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "calc(100vh - 112px)", // ✅ fits between navbar(56px) + footer(56px)
        background: "linear-gradient(45deg, #b2dfdb, #e0f2f1, #ffffff)",
        overflow: "hidden",
      }}
    >
      {/* LOGIN SCREEN */}
      {step === 0 && (
        <Card
          sx={{
            width: "100%",
            maxWidth: 420,
            p: 4,
            borderRadius: 4,
            boxShadow: 6,
            textAlign: "center",
            backgroundColor: "#ffffffcc",
          }}
        >
          <Box sx={{ textAlign: "center", mb: 2 }}>
            <img src={logo} alt="IITJ Logo" width="80" />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: "bold", mb: 2 }}>
            EV Charging Station Demand Forecasting
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2, fontStyle: "italic" }}
          >
            Subject: Time Series Analysis (MAL7430) <br />
            <b>Instructor: Ganesh Manjhi</b>
          </Typography>

          <TextField
            label="Login ID"
            variant="outlined"
            fullWidth
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Password"
            type="password"
            variant="outlined"
            fullWidth
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            sx={{ mb: 2 }}
          />
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Invalid Login ID or Password
            </Alert>
          )}
          <Button
            variant="contained"
            fullWidth
            onClick={handleLogin}
            sx={{
              background: "linear-gradient(90deg, #00796b, #004d40)",
              "&:hover": { background: "linear-gradient(90deg,#004d40,#00251a)" },
            }}
          >
            Login
          </Button>

          <Typography
            variant="caption"
            display="block"
            sx={{ mt: 2, color: "text.secondary" }}
          >
            Hint – Use your Roll Number (e.g. M24DE3076)
          </Typography>
        </Card>
      )}

      {/* WELCOME SCREEN */}
      {step === 1 && (
        <Card
          sx={{
            display: "flex",
            flexDirection: "row",
            width: "100%",
            maxWidth: "900px",
            borderRadius: 4,
            boxShadow: 8,
            overflow: "hidden",
          }}
        >
          {/* Left panel */}
          <Box
            sx={{
              flex: 1,
              backgroundColor: "#004d40",
              color: "#fff",
              p: 4,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <img src={logo} alt="IITJ Logo" width="80" />
            <Typography variant="h6" sx={{ mt: 2, fontWeight: 600 }}>
              Indian Institute of Technology Jodhpur
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Date: {new Date().toLocaleDateString()}
            </Typography>
            <Typography variant="body2" sx={{ mt: 3 }}>
              Subject – Time Series Analysis (MAL7430)
            </Typography>
            <Typography variant="body2">
              Instructor – Ganesh Manjhi
            </Typography>
          </Box>

          {/* Right panel */}
          <Box
            sx={{
              flex: 2,
              backgroundColor: "#e0f2f1",
              p: 6,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <Typography
              variant="h4"
              textAlign="center"
              sx={{ fontWeight: "bold", color: "#004d40", mb: 3 }}
            >
              Welcome to <br />
              EV Charging Station Demand Forecasting
            </Typography>
            <Button
              variant="contained"
              onClick={handleStart}
              sx={{
                alignSelf: "center",
                px: 6,
                py: 1.5,
                background: "linear-gradient(90deg,#00796b,#004d40)",
                "&:hover": {
                  background: "linear-gradient(90deg,#004d40,#00251a)",
                },
              }}
            >
              Start
            </Button>
          </Box>
        </Card>
      )}
    </Box>
  );
}
