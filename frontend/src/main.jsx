import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import CaseFilePage from "./components/CaseFilePage.jsx";
import "./index.css";

const THEME_KEY = "ssh_detector_theme";
const theme = localStorage.getItem(THEME_KEY) || "dark";

const caseMatch = window.location.pathname.match(/^\/case\/([^/]+)\/?$/);
const root = ReactDOM.createRoot(document.getElementById("root"));

if (caseMatch) {
  root.render(
    <React.StrictMode>
      <CaseFilePage publicId={decodeURIComponent(caseMatch[1])} theme={theme} />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
