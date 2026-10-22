import React from "react";
import ReactDOM from "react-dom/client";
// Self-hosted: the CSP only allows same-origin fonts, and system fallbacks
// (e.g. Malgun Gothic) collapse the UI's intermediate weights into bold.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import App from "./App";
import "./style.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
