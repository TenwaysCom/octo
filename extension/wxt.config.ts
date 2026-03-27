import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-vue"],
  webExt: {
    disabled: true,
  },
  manifest: {
    name: "Tenways Octo 0.1.1",
    version: "0.1.1",
    description: "跨平台协同助手 - Lark 到 Meegle 半自动建单工具",
    icons: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
    permissions: ["tabs", "activeTab", "scripting", "storage"],
    host_permissions: [
      "http://localhost:3000/*",
      "https://*.feishu.cn/*",
      "https://*.larksuite.com/*",
      "https://meegle.com/*",
      "https://*.meegle.com/*",
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
    ],
  },
});
