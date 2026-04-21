import { useEffect, useRef } from "react";

import { PopupAppView } from "./PopupAppView.js";
import { usePopupApp } from "./hooks/usePopupApp.js";

export default function App() {
  const popupApp = usePopupApp();
  const hasStartedInitializeRef = useRef(false);

  useEffect(() => {
    if (hasStartedInitializeRef.current) {
      return;
    }

    hasStartedInitializeRef.current = true;
    void popupApp.initialize();
  }, [popupApp.initialize]);

  return <PopupAppView popupApp={popupApp} />;
}
