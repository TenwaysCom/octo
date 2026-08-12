import { useCallback, useEffect, useState } from "react";
import { detectOctoExtension } from "../services/auth/extension-presence.js";
import {
  getWebProfile,
  logoutWebAuthSession,
  startLarkLogin,
} from "../services/auth/lark-auth-api.js";
import { usePluginLogin } from "../hooks/usePluginLogin.js";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut.js";
import { UnauthenticatedPage, SessionLoadingPage } from "../pages/LoginPage.jsx";
import { KeyboardShortcutsPage } from "../pages/KeyboardShortcutsPage.jsx";
import { LarkTicketDetailPage } from "../pages/LarkTicketDetailPage.jsx";
import { PlatformListPage } from "../pages/PlatformListPage.jsx";
import { SettingsIntegrationsPage } from "../pages/SettingsIntegrationsPage.jsx";
import { SyncStatusPage } from "../pages/SyncStatusPage.jsx";
import { getWorkspaceRoute } from "./routes/workspace-routes.js";

const WORKSPACE_PAGE_COMPONENTS = {
  integrations: SettingsIntegrationsPage,
  sync: SyncStatusPage,
  shortcuts: KeyboardShortcutsPage,
  "lark-ticket-detail": LarkTicketDetailPage,
  "lark-tickets": PlatformListPage,
  "meegle-workitems": PlatformListPage,
  "github-pull-requests": PlatformListPage,
};

export function App({ apiBaseUrl }) {
  const [status, setStatus] = useState();
  const [isBusy, setIsBusy] = useState(false);
  const [profile, setProfile] = useState();
  const [sessionStatus, setSessionStatus] = useState("checking");
  const [extension, setExtension] = useState({ status: "checking" });
  const [workspaceRoute, setWorkspaceRoute] = useState(() => getWorkspaceRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setWorkspaceRoute(getWorkspaceRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (sessionStatus === "checking") {
      document.title = "Tenways Octo";
      return;
    }

    document.title = profile
      ? `${workspaceRoute.title} · Tenways Octo`
      : "登录 · Tenways Octo";
  }, [profile, sessionStatus, workspaceRoute]);

  const checkSession = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await getWebProfile({ apiBaseUrl });
      setProfile(result.authenticated ? result.profile : undefined);
      setStatus(undefined);
    } finally {
      setSessionStatus("checked");
      setIsBusy(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (profile) {
      return undefined;
    }

    let active = true;
    void detectOctoExtension().then((result) => {
      if (active) {
        setExtension(result.detected ? { status: "detected", version: result.version } : { status: "missing" });
      }
    });
    return () => { active = false; };
  }, [profile]);

  const logout = useCallback(async () => {
    setIsBusy(true);
    await logoutWebAuthSession({ apiBaseUrl });
    setProfile(undefined);
    setStatus({ title: "已退出登录", text: "你的本工作台会话已结束。" });
    setIsBusy(false);
  }, [apiBaseUrl]);

  const loginWithPlugin = usePluginLogin({
    apiBaseUrl,
    extensionStatus: extension.status,
    setIsBusy,
    setProfile,
    setStatus,
  });

  useKeyboardShortcut({
    key: "?",
    enabled: Boolean(profile),
    handler: (event) => {
      event.preventDefault();
      window.location.hash = "#shortcuts";
    },
  });

  if (sessionStatus === "checking") {
    return <SessionLoadingPage />;
  }

  if (profile) {
    const WorkspacePage = WORKSPACE_PAGE_COMPONENTS[workspaceRoute.page];
    return <WorkspacePage
      profile={profile}
      ticketRecordId={workspaceRoute.ticketRecordId}
      page={workspaceRoute.page}
      apiBaseUrl={apiBaseUrl}
      onLogout={() => void logout()}
      onReauthorize={() => startLarkLogin({ apiBaseUrl })}
      isBusy={isBusy}
    />;
  }

  return <UnauthenticatedPage
    status={status}
    isBusy={isBusy}
    extension={extension}
    onLogin={() => startLarkLogin({ apiBaseUrl })}
    onPluginLogin={() => void loginWithPlugin()}
  />;
}
