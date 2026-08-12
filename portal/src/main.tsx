import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initI18n } from "./i18n";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

initI18n().then(() => {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
