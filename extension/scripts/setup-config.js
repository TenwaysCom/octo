/**
 * Extension Setup Script
 *
 * Run this in Chrome DevTools Console on any page to configure the extension.
 * Open: chrome://extensions -> Tenways Octo -> Service Worker -> Console
 */

// 配置凭据
const config = {
  MEEGLE_PLUGIN_ID: 'MII_ABD86EEDB9E8CA36',
  LARK_APP_ID: 'cli_a9155c5fb1b99ed2',
  SERVER_URL: 'http://localhost:3000',
  MEEGLE_BASE_URL: 'https://project.larksuite.com',
};

// 保存到 Chrome Storage
chrome.storage.sync.set(config, () => {
  console.log('✅ Extension configured successfully!');
  console.log('Config:', config);
});

// 验证配置
chrome.storage.sync.get(null, (items) => {
  console.log('Current storage:', items);
});