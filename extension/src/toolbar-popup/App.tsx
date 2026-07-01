import { useEffect, useRef } from "react";

import { getConfig } from "../background/config.js";
import { normalizeMeegleAuthBaseUrl } from "../platform-url.js";
import { ToolbarPopupView } from "./ToolbarPopupView.js";
import { usePopupApp } from "../popup-react/hooks/usePopupApp.js";
import type { PopupSettingsForm } from "../popup/types.js";

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

  const openMeegleAuthPage = async () => {
    const config = await getConfig();
    const url = normalizeMeegleAuthBaseUrl(
      popupApp.state.currentTabOrigin,
      config.MEEGLE_BASE_URL,
    );
    await chrome.tabs.create({
      url,
      active: true,
    });
  };
  const changeEnvironment = (environmentName: NonNullable<PopupSettingsForm["ENV_NAME"]>) => {
    popupApp.updateSettingsFormField("ENV_NAME", environmentName);
  };

  return (
    <ToolbarPopupView
      pageType={popupApp.state.pageType}
      meegleStatusText={popupApp.meegleStatus.text}
      larkStatusText={popupApp.larkStatus.text}
      meegleAuthorized={popupApp.state.isAuthed.meegle}
      larkAuthorized={popupApp.state.isAuthed.lark}
      environmentName={popupApp.settingsForm.ENV_NAME || "prod"}
      serverUrl={popupApp.settingsForm.SERVER_URL}
      onEnvironmentChange={changeEnvironment}
      onSaveEnvironment={popupApp.saveSettingsForm}
      onAuthorizeMeegle={openMeegleAuthPage}
      onAuthorizeLark={popupApp.authorizeLark}
    />
  );
}
