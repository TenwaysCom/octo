const BASE_URL = "https://weknora.odoo.tenways.it:18443";
const LOAD_TIMEOUT_MS = 8_000;
let sdkPromise;

function loadSdk(document, window) {
  if (window.WeKnora) return Promise.resolve(window.WeKnora);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error("WeKnora SDK load failed"));
      };
      const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
      script.src = `${BASE_URL}/weknora-widget.js`;
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        script.remove();
        if (window.WeKnora) resolve(window.WeKnora);
        else reject(new Error("WeKnora SDK unavailable"));
      };
      script.onerror = fail;
      document.head.appendChild(script);
    }).catch((error) => { sdkPromise = undefined; throw error; });
  }
  return sdkPromise;
}

export function mountWeKnoraWidget({ apiBaseUrl, document = globalThis.document, window = globalThis.window, load = loadSdk, fetch = globalThis.fetch, timeoutMs = LOAD_TIMEOUT_MS }) {
  let disposed = false;
  let instance;
  const controller = new AbortController();
  const tokenEndpoint = `${apiBaseUrl.replace(/\/$/, "")}/weknora/embed-token`;
  const timer = setTimeout(() => { disposed = true; controller.abort(); }, timeoutMs);
  const checkAvailability = async () => {
    const response = await fetch(tokenEndpoint, { credentials: "include", cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("WeKnora unavailable");
    const data = await response.json();
    if (typeof data?.token !== "string" || !data.token.trim() || !(data.expiresIn > 0)) throw new Error("WeKnora invalid response");
  };
  void Promise.all([Promise.resolve().then(() => load(document, window)), checkAvailability()]).then(([sdk]) => {
    if (disposed) return;
    sdk.init({
      channel: "6410a037-6485-4408-8173-4b0c498a0426",
      tokenEndpoint,
      baseUrl: BASE_URL,
      position: "bottom-right",
      primaryColor: "#7d6955",
      title: "octo 客服",
    });
    instance = sdk;
  }).catch(() => { /* The external widget must not interrupt the Ticket page. */ })
    .finally(() => { clearTimeout(timer); controller.abort(); });
  return () => { disposed = true; clearTimeout(timer); controller.abort(); instance?.destroy(); };
}
