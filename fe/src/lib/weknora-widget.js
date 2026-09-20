const BASE_URL = "https://weknora.odoo.tenways.it:18443";
let sdkPromise;

function loadSdk(document, window) {
  if (window.WeKnora) return Promise.resolve(window.WeKnora);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${BASE_URL}/weknora-widget.js`;
      script.async = true;
      script.onload = () => {
        script.remove();
        if (window.WeKnora) resolve(window.WeKnora);
        else reject(new Error("WeKnora SDK unavailable"));
      };
      script.onerror = () => { script.remove(); reject(new Error("WeKnora SDK load failed")); };
      document.head.appendChild(script);
    }).catch((error) => { sdkPromise = undefined; throw error; });
  }
  return sdkPromise;
}

export function mountWeKnoraWidget({ apiBaseUrl, document = globalThis.document, window = globalThis.window, load = loadSdk }) {
  let disposed = false;
  let instance;
  void load(document, window).then((sdk) => {
    if (disposed) return;
    sdk.init({
      channel: "6410a037-6485-4408-8173-4b0c498a0426",
      tokenEndpoint: `${apiBaseUrl.replace(/\/$/, "")}/weknora/embed-token`,
      baseUrl: BASE_URL,
      position: "top-right",
      primaryColor: "#7d6955",
      title: "octo 客服",
    });
    instance = sdk;
  }).catch(() => { /* The external widget must not interrupt the Ticket page. */ });
  return () => { disposed = true; instance?.destroy(); };
}
