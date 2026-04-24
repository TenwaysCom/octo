import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

const chromiumProfile = process.env.WXT_CHROMIUM_PROFILE?.trim();
const devPort = Number(process.env.WXT_DEV_PORT || 3000);
const devOrigin = process.env.WXT_DEV_ORIGIN?.trim() || `http://localhost:${devPort}`;
const devHost = (() => {
  try {
    return new URL(devOrigin).hostname;
  } catch {
    return "localhost";
  }
})();

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  alias: {
    "@": "src",
  },
  vite: () => ({
    plugins: [tailwindcss()],
    // Popup HTML is served from chrome-extension:// while scripts load from this origin.
    // Without explicit HMR settings, the Vite client may pick the wrong WS host/port and
    // React Fast Refresh never connects, so popup-react edits appear to "not update".
    server: {
      hmr: {
        protocol: "ws",
        host: devHost,
        port: devPort,
        clientPort: devPort,
      },
    },
  }),
  dev: {
    server: {
      port: devPort,
      origin: devOrigin,
    },
  },
  // Fall back to manual unpacked-extension install when no fixed dev profile is provided.
  webExt: chromiumProfile
    ? {
        disabled: false,
        keepProfileChanges: true,
        chromiumProfile,
      }
    : {
        disabled: true,
      },
  manifest: {
    name: "Tenways Octo 0.6.1",
    version: "0.6.1",
    description: "跨平台协同助手 - Lark 到 Meegle 半自动建单工具",
    icons: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
    permissions: ["tabs", "activeTab", "scripting", "storage", "cookies", "alarms", "notifications", "downloads"],
    host_permissions: [
      "http://localhost/*",
      "https://*.feishu.cn/*",
      "https://*.larksuite.com/*",
      "https://meegle.com/*",
      "https://*.meegle.com/*",
      "https://github.com/*",
    ],
    web_accessible_resources: [
      {
        resources: ["page-bridge.js"],
        matches: [
          "https://meegle.com/*",
          "https://*.meegle.com/*",
          "https://project.larksuite.com/*",
        ],
      },
      {
        resources: ["icons/*"],
        matches: [
          "https://*.feishu.cn/*",
          "https://*.larksuite.com/*",
          "https://meegle.com/*",
          "https://*.meegle.com/*",
          "https://github.com/*",
        ],
      },
      {
        resources: ["popup.html"],
        matches: [
          "https://*.feishu.cn/*",
          "https://*.larksuite.com/*",
          "https://meegle.com/*",
          "https://*.meegle.com/*",
          "https://github.com/*",
        ],
      },
    ],
  },
});
