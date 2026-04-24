import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.js";
import "../popup-react/styles.css";

const container = document.querySelector("#app");

if (!(container instanceof HTMLElement)) {
  throw new Error("Toolbar popup root element #app was not found.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
