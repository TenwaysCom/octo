import { useEffect } from "react";

import { PopupAppView } from "./PopupAppView.js";
import { usePopupApp } from "./hooks/usePopupApp.js";

export default function App() {
  const popupApp = usePopupApp();

  useEffect(() => {
    void popupApp.initialize();
  }, [popupApp.initialize]);

  return <PopupAppView popupApp={popupApp} />;
}
