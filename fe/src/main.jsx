import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { getFrontendConfig } from "./runtime-config.js";
import "./styles.css";

const config = getFrontendConfig(import.meta.env);

createRoot(document.getElementById("root")).render(
  <StrictMode><App {...config} /></StrictMode>,
);
