/**
 * Tenways Octo Popup - Refactored
 */

import { createMeegleAuthController } from "./popup/meegle-auth.js";
import { resolveMeegleStatusDisplay } from "./popup/meegle-auth.js";
import { DEFAULT_CONFIG, getConfig } from "./background/config.js";
import {
  normalizeMeegleAuthBaseUrl,
  resolvePlatformUrl,
} from "./platform-url.js";

const $ = (id) => document.getElementById(id);

const dom = {
  headerSubtitle: $('headerSubtitle'),
  // Auth block top
  authBlockTop: $('authBlockTop'),
  meegleUserTop: $('meegleUserTop'),
  larkUserTop: $('larkUserTop'),
  meegleAuthBtn: $('meegleAuthBtn'),
  larkAuthBtn: $('larkAuthBtn'),
  // Feature blocks
  meegleFeatureBlock: $('meegleFeatureBlock'),
  larkFeatureBlock: $('larkFeatureBlock'),
  analyzeBtn: $('analyzeBtn'),
  draftBtn: $('draftBtn'),
  applyBtn: $('applyBtn'),
  meegleActionBtn: $('meegleActionBtn'),
  // Auth block bottom
  authBlockBottom: $('authBlockBottom'),
  meegleUserBottom: $('meegleUserBottom'),
  larkUserBottom: $('larkUserBottom'),
  meegleReauthBtn: $('meegleReauthBtn'),
  larkReauthBtn: $('larkReauthBtn'),
  // Other
  unsupportedPage: $('unsupportedPage'),
  logContent: $('logContent'),
  clearLogBtn: $('clearLogBtn'),
  // Settings
  settingsBtn: $('settingsBtn'),
  settingsModal: $('settingsModal'),
  closeSettingsBtn: $('closeSettingsBtn'),
  cancelSettingsBtn: $('cancelSettingsBtn'),
  saveSettingsBtn: $('saveSettingsBtn'),
  serverUrlInput: $('serverUrlInput'),
  meeglePluginIdInput: $('meeglePluginIdInput'),
  meegleUserKeyInput: $('meegleUserKeyInput'),
  larkUserIdInput: $('larkUserIdInput'),
};

const state = {
  currentTabId: null,
  currentTabOrigin: null,
  pageType: null,
  url: null,
  identity: { larkId: null, meegleUserKey: null },
  meegleAuth: { status: null, authCode: null },
  larkAuth: { status: null },
  analysisResult: null,
  draftResult: null,
  isAuthed: { meegle: false, lark: false },
};

const log = {
  add(msg, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    dom.logContent.appendChild(entry);
    dom.logContent.scrollTop = dom.logContent.scrollHeight;
  },
  success(msg) { this.add(msg, 'success'); },
  error(msg) { this.add(msg, 'error'); },
  warn(msg) { this.add(msg, 'warn'); },
  clear() { dom.logContent.innerHTML = ''; },
};

function setStatus(el, status, text) {
  el.className = `auth-status ${status}`;
  el.textContent = text;
}

function setMeegleAuthButtons(isAuthorized) {
  dom.meegleAuthBtn.disabled = Boolean(isAuthorized);
  dom.meegleAuthBtn.textContent = isAuthorized ? '已授权' : '授权';
}

function applyMeegleStatus(auth = state.meegleAuth) {
  const display = resolveMeegleStatusDisplay(auth, state.identity.meegleUserKey || undefined);
  setStatus(dom.meegleUserTop, display.status, display.text);
  setStatus(dom.meegleUserBottom, display.status, display.text);
}

function hideAll() {
  dom.authBlockTop.classList.add('hidden');
  dom.authBlockBottom.classList.add('hidden');
  dom.meegleFeatureBlock.classList.add('hidden');
  dom.larkFeatureBlock.classList.add('hidden');
  dom.unsupportedPage.classList.add('hidden');
}

function detectPageType(url) {
  return resolvePlatformUrl(url, {
    meegleAuthBaseUrl: DEFAULT_CONFIG.MEEGLE_BASE_URL,
  }).platform;
}

// Auth handlers
async function checkMeegleAuth() {
  const config = await getConfig();
  const settings = await loadSettings();
  const meegleUserKey = settings.meegleUserKey || state.identity.meegleUserKey || '';
  const authBaseUrl = normalizeMeegleAuthBaseUrl(
    state.currentTabOrigin,
    config.MEEGLE_BASE_URL,
  );

  try {
    const response = await fetch(`${config.SERVER_URL}/api/meegle/auth/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operatorLarkId: state.identity.larkId || 'ou_user',
        meegleUserKey: meegleUserKey || undefined,
        baseUrl: authBaseUrl,
      }),
    });

    if (!response.ok) {
      return { status: 'unknown', reason: 'STATUS_REQUEST_FAILED' };
    }

    const result = await response.json();
    return result?.data || { status: 'unknown' };
  } catch (error) {
    log.warn(`查询服务器授权状态失败: ${error instanceof Error ? error.message : String(error)}`);
    return { status: 'unknown', reason: 'STATUS_REQUEST_FAILED' };
  }
}

const meegleAuthController = createMeegleAuthController({
  getExistingStatus: checkMeegleAuth,
  sendMessage: async (request) =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: 'itdog.meegle.auth.ensure',
          payload: request,
        },
        (res) => {
          if (chrome.runtime.lastError) {
            resolve({
              status: 'failed',
              baseUrl: request.baseUrl,
              reason: 'BACKGROUND_ERROR',
              errorMessage: chrome.runtime.lastError.message,
            });
            return;
          }

          if (res?.payload) {
            resolve(res.payload);
            return;
          }

          if (res?.error) {
            resolve({
              status: 'failed',
              baseUrl: request.baseUrl,
              reason: res.error.errorCode || 'BACKGROUND_ERROR',
              errorMessage: res.error.errorMessage,
            });
            return;
          }

          resolve({ status: 'unknown', baseUrl: request.baseUrl, reason: 'BACKGROUND_EMPTY_RESPONSE' });
        },
      );
    }),
  setStatus: (status, text) => {
    setStatus(dom.meegleUserTop, status, text);
    setStatus(dom.meegleUserBottom, status, text);
  },
  log,
});

async function checkLarkAuth() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'itdog.lark.auth.ensure', payload: { requestId: `req_${Date.now()}`, operatorLarkId: 'ou_user', baseUrl: 'https://open.larksuite.com' } },
      (res) => resolve(res?.payload || { status: 'unknown' })
    );
  });
}

async function doMeegleAuth() {
  const config = await getConfig();
  if (state.pageType === 'meegle') {
    await refreshCurrentMeegleIdentity();
  }

  const ok = await meegleAuthController.run({
    currentTabId: state.currentTabId,
    currentTabOrigin: state.currentTabOrigin,
    authBaseUrl: normalizeMeegleAuthBaseUrl(
      state.currentTabOrigin,
      config.MEEGLE_BASE_URL,
    ),
    currentPageType: state.pageType,
    larkId: state.identity.larkId,
    meegleUserKey: state.identity.meegleUserKey || undefined,
  });
  state.meegleAuth = meegleAuthController.getLastAuth() || { status: 'unknown' };
  state.isAuthed.meegle = ok;
  applyMeegleStatus(state.meegleAuth);
  setMeegleAuthButtons(ok);
  return ok;
}

async function doLarkAuth() {
  const config = await getConfig();
  log.add('检查 Lark 授权...');
  const auth = await checkLarkAuth();
  state.larkAuth = auth;

  if (auth.status === 'ready') {
    state.isAuthed.lark = true;
    setStatus(dom.larkUserTop, 'ready', '已授权');
    setStatus(dom.larkUserBottom, 'ready', '已授权');
    log.success('Lark 已授权');
    return true;
  }

  // Need to redirect
  log.warn('需要登录 Lark');
  const appId = config.LARK_APP_ID;
  const redirectUri = `${config.SERVER_URL}/api/lark/auth/callback`;
  const oauthUrl = `https://open.larksuite.com/service-open/oauth/authorize?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${Date.now()}&scope=contact:readonly:user&response_type=code`;
  // chrome.tabs.create({ url: oauthUrl, active: true });
  return false;
}

async function init() {
  log.add('初始化...');

  // Load saved identity settings first
  await loadSavedIdentity();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    hideAll();
    dom.unsupportedPage.classList.remove('hidden');
    return;
  }

  state.url = tab.url;
  state.currentTabId = tab.id ?? null;
  state.currentTabOrigin = new URL(tab.url).origin;
  state.pageType = detectPageType(tab.url);

  // Unsupported page
  if (state.pageType === 'unsupported') {
    hideAll();
    dom.unsupportedPage.classList.remove('hidden');
    dom.headerSubtitle.textContent = '不支持';
    log.warn('当前页面不支持');
    return;
  }

  // Show auth block top
  hideAll();
  dom.authBlockTop.classList.remove('hidden');
  dom.headerSubtitle.textContent = state.pageType === 'meegle' ? 'Meegle' : 'Lark';

  // Set initial status - use saved identity if available
  applyMeegleStatus();
  setMeegleAuthButtons(false);
  if (state.identity.larkId) {
    setStatus(dom.larkUserTop, 'ready', state.identity.larkId);
    setStatus(dom.larkUserBottom, 'ready', state.identity.larkId);
  } else {
    setStatus(dom.larkUserTop, 'pending', '-');
    setStatus(dom.larkUserBottom, 'pending', '-');
  }

  // Get user identity
  if (state.pageType === 'lark') {
    try {
      const res = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: 'getLarkUserId' }, (r) => resolve(r));
      });
      if (res?.userId) {
        state.identity.larkId = res.userId;
        setStatus(dom.larkUserTop, 'ready', res.userId);
        setStatus(dom.larkUserBottom, 'ready', res.userId);
      }
    } catch (e) {}

    // Check auth status
    const [meegleAuth, larkAuth] = await Promise.all([checkMeegleAuth(), checkLarkAuth()]);
    state.meegleAuth = meegleAuth;
    state.larkAuth = larkAuth;

    state.isAuthed.meegle = meegleAuth.status === 'ready';
    applyMeegleStatus(meegleAuth);
    setMeegleAuthButtons(state.isAuthed.meegle);
    if (larkAuth.status === 'ready') {
      state.isAuthed.lark = true;
      // Keep user ID display if already set
      if (!state.identity.larkId) {
        setStatus(dom.larkUserTop, 'ready', '已授权');
        setStatus(dom.larkUserBottom, 'ready', '已授权');
      }
    }

    // Show Lark feature block if both authed
    if (state.isAuthed.meegle && state.isAuthed.lark) {
      dom.larkFeatureBlock.classList.remove('hidden');
      dom.authBlockBottom.classList.remove('hidden');
      dom.analyzeBtn.disabled = false;
      dom.draftBtn.disabled = false;
      dom.applyBtn.disabled = false;
    }
  } else if (state.pageType === 'meegle') {
    await refreshCurrentMeegleIdentity();

    // Check auth status
    const [meegleAuth, larkAuth] = await Promise.all([checkMeegleAuth(), checkLarkAuth()]);
    state.meegleAuth = meegleAuth;
    state.larkAuth = larkAuth;

    state.isAuthed.meegle = meegleAuth.status === 'ready';
    applyMeegleStatus(meegleAuth);
    setMeegleAuthButtons(state.isAuthed.meegle);
    if (larkAuth.status === 'ready') {
      state.isAuthed.lark = true;
      // On Meegle page, show auth status for Lark
      setStatus(dom.larkUserTop, 'ready', '已授权');
      setStatus(dom.larkUserBottom, 'ready', '已授权');
    }

    // Show Meegle feature block if both authed
    if (state.isAuthed.meegle && state.isAuthed.lark) {
      dom.meegleFeatureBlock.classList.remove('hidden');
      dom.authBlockBottom.classList.remove('hidden');
    }
  }

  log.success('初始化完成');
}

async function refreshCurrentMeegleIdentity() {
  if (state.pageType !== 'meegle' || state.currentTabId == null) {
    return;
  }

  try {
    const res = await new Promise((resolve) => {
      chrome.tabs.sendMessage(state.currentTabId, { action: 'getMeegleUserIdentity' }, (r) => resolve(r));
    });
    if (res?.userKey) {
      state.identity.meegleUserKey = res.userKey;
      applyMeegleStatus();
    }
  } catch (e) {}
}

// Event listeners
dom.meegleAuthBtn.addEventListener('click', doMeegleAuth);
dom.larkAuthBtn.addEventListener('click', doLarkAuth);
dom.meegleReauthBtn.addEventListener('click', doMeegleAuth);
dom.larkReauthBtn.addEventListener('click', doLarkAuth);
dom.clearLogBtn.addEventListener('click', () => log.clear());

dom.analyzeBtn.addEventListener('click', async () => {
  log.add('分析中...');
  log.warn('功能开发中，请稍后');
});

dom.draftBtn.addEventListener('click', async () => {
  log.add('生成草稿...');
  log.warn('功能开发中，请稍后');
});

dom.applyBtn.addEventListener('click', async () => {
  log.add('确认创建...');
  log.warn('功能开发中，请稍后');
});

dom.meegleActionBtn.addEventListener('click', async () => {
  log.add('查看来源上下文...');
  log.warn('功能开发中，请稍后');
});

// Settings functions
async function loadSettings() {
  const localSettings = await new Promise((resolve) => {
    chrome.storage.local.get(['meegleUserKey', 'larkUserId'], (result) => {
      resolve(result);
    });
  });
  const config = await getConfig();
  return {
    ...localSettings,
    SERVER_URL: config.SERVER_URL || DEFAULT_CONFIG.SERVER_URL,
    MEEGLE_PLUGIN_ID: config.MEEGLE_PLUGIN_ID || '',
  };
}

async function saveSettings(serverUrl, meeglePluginId, meegleUserKey, larkUserId) {
  await new Promise((resolve) => {
    chrome.storage.local.set({ meegleUserKey, larkUserId }, resolve);
  });

  await new Promise((resolve) => {
    chrome.storage.sync.set({
      SERVER_URL: serverUrl || DEFAULT_CONFIG.SERVER_URL,
      MEEGLE_PLUGIN_ID: meeglePluginId,
    }, resolve);
  });
}

async function openSettings() {
  dom.settingsModal.classList.remove('hidden');
  const settings = await loadSettings();

  dom.serverUrlInput.value = settings.SERVER_URL || DEFAULT_CONFIG.SERVER_URL;
  dom.meeglePluginIdInput.value = settings.MEEGLE_PLUGIN_ID || '';
  dom.meegleUserKeyInput.value = settings.meegleUserKey || '';
  dom.larkUserIdInput.value = settings.larkUserId || '';
}

function closeSettings() {
  dom.settingsModal.classList.add('hidden');
}

dom.settingsBtn.addEventListener('click', openSettings);
dom.closeSettingsBtn.addEventListener('click', closeSettings);
dom.cancelSettingsBtn.addEventListener('click', closeSettings);

dom.saveSettingsBtn.addEventListener('click', async () => {
  const serverUrl = dom.serverUrlInput.value.trim();
  const meeglePluginId = dom.meeglePluginIdInput.value.trim();
  const meegleUserKey = dom.meegleUserKeyInput.value.trim();
  const larkUserId = dom.larkUserIdInput.value.trim();

  await saveSettings(serverUrl, meeglePluginId, meegleUserKey, larkUserId);

  // Update state
  if (meegleUserKey) {
    state.identity.meegleUserKey = meegleUserKey;
    applyMeegleStatus();
  }
  if (larkUserId) {
    state.identity.larkId = larkUserId;
    setStatus(dom.larkUserTop, 'ready', larkUserId);
    setStatus(dom.larkUserBottom, 'ready', larkUserId);
  }

  log.success('设置已保存');
  closeSettings();
});

// Load saved settings on init
async function loadSavedIdentity() {
  const settings = await loadSettings();
  if (settings.meegleUserKey) {
    state.identity.meegleUserKey = settings.meegleUserKey;
  }
  if (settings.larkUserId) {
    state.identity.larkId = settings.larkUserId;
  }
}

init();
