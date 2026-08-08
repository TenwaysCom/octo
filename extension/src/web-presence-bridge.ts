export const OCTO_EXTENSION_PRESENCE_PROBE_EVENT = "tenways-octo:extension-presence-probe";
export const OCTO_EXTENSION_PRESENCE_READY_EVENT = "tenways-octo:extension-presence-ready";
export const OCTO_PLUGIN_LOGIN_PROBE_EVENT = "tenways-octo:plugin-login-probe";
export const OCTO_PLUGIN_LOGIN_READY_EVENT = "tenways-octo:plugin-login-ready";
export const OCTO_WEB_BRIDGE_PROTOCOL_VERSION = 2;

interface PresenceProbeEvent extends Event {
  detail?: { nonce?: unknown };
}

interface PluginLoginProbeEvent extends Event {
  detail?: { nonce?: unknown; challengeId?: unknown };
}

export function installOctoWebPresenceBridge({
  windowRef = window,
  version,
  approvePluginLogin,
}: {
  windowRef?: Window;
  version: string;
  approvePluginLogin?: (challengeId: string) => Promise<{
    status: "approved" | "failed";
    errorCode?: string;
  }>;
}): () => void {
  const onProbe = (event: Event) => {
    const nonce = (event as PresenceProbeEvent).detail?.nonce;
    if (typeof nonce !== "string" || nonce.length === 0) {
      return;
    }

    windowRef.dispatchEvent(new CustomEvent(OCTO_EXTENSION_PRESENCE_READY_EVENT, {
      detail: { nonce, version, protocolVersion: OCTO_WEB_BRIDGE_PROTOCOL_VERSION },
    }));
  };

  const onPluginLoginProbe = async (event: Event) => {
    const detail = (event as PluginLoginProbeEvent).detail;
    const nonce = detail?.nonce;
    const challengeId = detail?.challengeId;
    if (typeof nonce !== "string" || nonce.length === 0 || typeof challengeId !== "string" || challengeId.length === 0) {
      return;
    }

    const result = approvePluginLogin
      ? await approvePluginLogin(challengeId)
      : { status: "failed" as const, errorCode: "PLUGIN_LOGIN_UNAVAILABLE" };
    windowRef.dispatchEvent(new CustomEvent(OCTO_PLUGIN_LOGIN_READY_EVENT, {
      detail: {
        nonce,
        status: result.status,
        protocolVersion: OCTO_WEB_BRIDGE_PROTOCOL_VERSION,
        ...(result.status === "failed" && result.errorCode ? { errorCode: result.errorCode } : {}),
      },
    }));
  };

  windowRef.addEventListener(OCTO_EXTENSION_PRESENCE_PROBE_EVENT, onProbe);
  windowRef.addEventListener(OCTO_PLUGIN_LOGIN_PROBE_EVENT, onPluginLoginProbe);
  return () => {
    windowRef.removeEventListener(OCTO_EXTENSION_PRESENCE_PROBE_EVENT, onProbe);
    windowRef.removeEventListener(OCTO_PLUGIN_LOGIN_PROBE_EVENT, onPluginLoginProbe);
  };
}
