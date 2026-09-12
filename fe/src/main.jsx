import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.jsx";
import { getFrontendConfig } from "./app/runtime-config.js";
import "./styles/global.css";

const config = getFrontendConfig(import.meta.env);

createRoot(document.getElementById("root")).render(
  <StrictMode><App {...config} /></StrictMode>,
);
