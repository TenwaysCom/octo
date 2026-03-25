/**
 * Tenways Octo Popup - Refactored
 */

const CONFIG = {
  SERVER_URL: 'http://localhost:3000',
  MEEGLE_BASE_URL: 'https://project.larksuite.com',
  LARK_APP_ID: 'cli_a9155c5fb1b99ed2',
};

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
};

const state = {
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

function hideAll() {
  dom.authBlockTop.classList.add('hidden');
  dom.authBlockBottom.classList.add('hidden');
  dom.meegleFeatureBlock.classList.add('hidden');
  dom.larkFeatureBlock.classList.add('hidden');
  dom.unsupportedPage.classList.add('hidden');
}

function detectPageType(url) {
  if (url.includes('project.larksuite.com') || url.includes('meegle.com')) return 'meegle';
  if (url.includes('feishu.cn') || url.includes('larksuite.com')) return 'lark';
  return 'unsupported';
}

// Auth handlers
async function checkMeegleAuth() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'itdog.meegle.auth.ensure', payload: { requestId: `req_${Date.now()}`, operatorLarkId: state.identity.larkId || 'ou_user', baseUrl: CONFIG.MEEGLE_BASE_URL } },
      (res) => resolve(res?.payload || { status: 'unknown' })
    );
  });
}

async function checkLarkAuth() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'itdog.lark.auth.ensure', payload: { requestId: `req_${Date.now()}`, operatorLarkId: 'ou_user', baseUrl: 'https://open.larksuite.com' } },
      (res) => resolve(res?.payload || { status: 'unknown' })
    );
  });
}

async function doMeegleAuth() {
  log.add('检查 Meegle 授权...');
  const auth = await checkMeegleAuth();
  state.meegleAuth = auth;

  if (auth.status === 'ready') {
    state.isAuthed.meegle = true;
    setStatus(dom.meegleUserTop, 'ready', auth.authCode || '已授权');
    setStatus(dom.meegleUserBottom, 'ready', auth.authCode || '已授权');
    log.success('Meegle 已授权');
    return true;
  }

  if (auth.authCode) {
    log.add('交换 Token...');
    try {
      const res = await fetch(`${CONFIG.SERVER_URL}/api/meegle/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: `req_${Date.now()}`, authCode: auth.authCode, state: auth.authCode }),
      });
      const result = await res.json();
      if (result.ok) {
        state.isAuthed.meegle = true;
        setStatus(dom.meegleUserTop, 'ready', '已授权');
        setStatus(dom.meegleUserBottom, 'ready', '已授权');
        log.success('Meegle 授权成功');
        return true;
      }
    } catch (e) {
      log.error('Token 交换失败');
    }
  }

  // Need to redirect - inform user
  log.warn('需要登录 Meegle');
  log.warn('请在 Meegle 页面登录后重试');
  // Note: Auto-redirect disabled, user needs to manually navigate to Meegle
  return false;
}

async function doLarkAuth() {
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
  const appId = CONFIG.LARK_APP_ID;
  const redirectUri = 'http://localhost:3000/api/lark/auth/callback';
  const oauthUrl = `https://open.larksuite.com/service-open/oauth/authorize?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${Date.now()}&scope=contact:readonly:user&response_type=code`;
  // chrome.tabs.create({ url: oauthUrl, active: true });
  return false;
}

async function init() {
  log.add('初始化...');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    hideAll();
    dom.unsupportedPage.classList.remove('hidden');
    return;
  }

  state.url = tab.url;
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

  // Set initial status
  setStatus(dom.meegleUserTop, 'pending', '-');
  setStatus(dom.larkUserTop, 'pending', '-');
  setStatus(dom.meegleUserBottom, 'pending', '-');
  setStatus(dom.larkUserBottom, 'pending', '-');

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

    if (meegleAuth.status === 'ready') {
      state.isAuthed.meegle = true;
      setStatus(dom.meegleUserTop, 'ready', meegleAuth.authCode || '已授权');
      setStatus(dom.meegleUserBottom, 'ready', meegleAuth.authCode || '已授权');
    }
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
    try {
      const res = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: 'getMeegleUserIdentity' }, (r) => resolve(r));
      });
      if (res?.userKey) {
        state.identity.meegleUserKey = res.userKey;
        setStatus(dom.meegleUserTop, 'ready', res.userKey);
        setStatus(dom.meegleUserBottom, 'ready', res.userKey);
      }
    } catch (e) {}

    // Check auth status
    const [meegleAuth, larkAuth] = await Promise.all([checkMeegleAuth(), checkLarkAuth()]);
    state.meegleAuth = meegleAuth;
    state.larkAuth = larkAuth;

    if (meegleAuth.status === 'ready') {
      state.isAuthed.meegle = true;
      setStatus(dom.meegleUserTop, 'ready', meegleAuth.authCode || '已授权');
      setStatus(dom.meegleUserBottom, 'ready', meegleAuth.authCode || '已授权');
    }
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

init();