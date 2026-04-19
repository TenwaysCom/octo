import React from "react";
import { createRoot } from "react-dom/client";

import App from "../popup-react/App.js";
import "../popup-react/styles.css";

const container = document.querySelector("#app");

if (!(container instanceof HTMLElement)) {
  throw new Error("Popup root element #app was not found.");
}

createRoot(container).render(React.createElement(App));
