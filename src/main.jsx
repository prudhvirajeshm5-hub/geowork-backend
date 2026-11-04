import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import LandingPage from "./LandingPage.jsx";
import App from "./App.jsx";
import "./index.css";
import "./LandingPage.css";
import "./admin-theme.css";

function Root() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/welcome" element={<LandingPage />} />
          <Route path="/*" element={<App />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
