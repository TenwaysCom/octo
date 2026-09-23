import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.jsx";
import { getFrontendConfig } from "./app/runtime-config.js";
import "./styles/global.css";
import { consumeLarkAppReturn, isLarkAppShortcut } from "./lib/lark-ticket-app.js";

const initialHash = isLarkAppShortcut(window.location.search) && !window.location.hash ? "#lark-app-thread-analysis" : window.location.hash;
const returnHash = consumeLarkAppReturn(initialHash, window.sessionStorage);
if (returnHash !== window.location.hash) window.history.replaceState(null, "", returnHash);

const config = getFrontendConfig(import.meta.env);

createRoot(document.getElementById("root")).render(
  <StrictMode><App {...config} /></StrictMode>,
);
