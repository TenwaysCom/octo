export const OCTO_EXTENSION_PRESENCE_PROBE_EVENT = "tenways-octo:extension-presence-probe";
export const OCTO_EXTENSION_PRESENCE_READY_EVENT = "tenways-octo:extension-presence-ready";

interface PresenceProbeEvent extends Event {
  detail?: { nonce?: unknown };
}

export function installOctoWebPresenceBridge({
  windowRef = window,
  version,
}: {
  windowRef?: Window;
  version: string;
}): () => void {
  const onProbe = (event: Event) => {
    const nonce = (event as PresenceProbeEvent).detail?.nonce;
    if (typeof nonce !== "string" || nonce.length === 0) {
      return;
    }

    windowRef.dispatchEvent(new CustomEvent(OCTO_EXTENSION_PRESENCE_READY_EVENT, {
      detail: { nonce, version },
    }));
  };

  windowRef.addEventListener(OCTO_EXTENSION_PRESENCE_PROBE_EVENT, onProbe);
  return () => windowRef.removeEventListener(OCTO_EXTENSION_PRESENCE_PROBE_EVENT, onProbe);
}
