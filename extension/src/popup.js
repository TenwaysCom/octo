/**
 * IT PM Assistant Popup
 */

const CONFIG = {
  SERVER_URL: 'http://localhost:3000',
  MEEGLE_BASE_URL: 'https://project.larksuite.com',
  PLUGIN_ID: 'your-plugin-id', // TODO: Configure via environment
};

// Error codes from docs/it-pm-assistant/11-extension-message-and-api-schema.md
const ERROR_MESSAGES = {
  IDENTITY_NOT_BOUND: '当前用户尚未绑定 Meegle 账号',
  MEEGLE_AUTH_REQUIRED: '需要 Meegle 认证',
  MEEGLE_NOT_LOGGED_IN: 'Meegle 未登录，请先登录',
  MEEGLE_AUTH_CODE_EXPIRED: '认证码已过期，请重新获取',
  MEEGLE_TOKEN_REFRESH_FAILED: 'Token 刷新失败，请重新认证',
  PLUGIN_ID_NOT_CONFIGURED: '插件 ID 未配置',
  AUTH_CODE_REQUEST_FAILED: '获取认证码失败',
  BACKGROUND_ERROR: '后台脚本错误',
  NETWORK_ERROR: '网络连接失败',
};

// DOM Elements
const $ = (id) => document.getElementById(id);

const dom = {
  headerSubtitle: $('headerSubtitle'),
  pageIcon: $('pageIcon'),
  pageTypeText: $('pageTypeText'),
  pageUrl: $('pageUrl'),
  meegleAuthSection: $('meegleAuthSection'),
  meegleAuthStatus: $('meegleAuthStatus'),
  meegleAuthBtn: $('meegleAuthBtn'),
  meegleRefreshBtn: $('meegleRefreshBtn'),
  larkAuthSection: $('larkAuthSection'),
  larkMeegleAuthStatus: $('larkMeegleAuthStatus'),
  larkLarkAuthStatus: $('larkLarkAuthStatus'),
  // A1 actions
  larkA1Actions: $('larkA1Actions'),
  analyzeBtn: $('analyzeBtn'),
  draftBtn: $('draftBtn'),
  applyBtn: $('applyBtn'),
  // A2 actions
  larkA2Actions: $('larkA2Actions'),
  analyzeA2Btn: $('analyzeA2Btn'),
  draftA2Btn: $('draftA2Btn'),
  applyA2Btn: $('applyA2Btn'),
  // Other / PM
  larkOtherActions: $('larkOtherActions'),
  pmAnalysisBtn: $('pmAnalysisBtn'),
  pmAnalysisSection: $('pmAnalysisSection'),
  pmTimeRange: $('pmTimeRange'),
  runPmAnalysisBtn: $('runPmAnalysisBtn'),
  closePmAnalysisBtn: $('closePmAnalysisBtn'),
  pmResult: $('pmResult'),
  unsupportedPage: $('unsupportedPage'),
  logContent: $('logContent'),
  clearLogBtn: $('clearLogBtn'),
};

// State
const state = {
  pageType: null,
  url: null,
  recordId: null,
  // A1 flow
  analysisResult: null,
  draftResult: null,
  // A2 flow
  a2RecordId: null,
  a2AnalysisResult: null,
  a2DraftResult: null,
  // Identity
  identity: { larkId: null, meegleUserKey: null, mappingStatus: 'unknown' },
  meegleAuth: { status: null, authCode: null },
  larkAuth: { status: null },
};

// Logger
const log = {
  _el: dom.logContent,
  add(msg, type = 'info') {
    if (!this._el) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.textContent = `[${time}] ${msg}`;
    this._el.appendChild(entry);
    this._el.scrollTop = this._el.scrollHeight;
  },
  clear() {
    if (this._el) this._el.innerHTML = '';
  },
  success(msg) { this.add(msg, 'success'); },
  error(msg) { this.add(msg, 'error'); },
  warn(msg) { this.add(msg, 'warn'); },
};

// UI Helpers
function showSection(section) {
  // Hide all sections
  dom.meegleAuthSection.classList.add('hidden');
  dom.larkAuthSection.classList.add('hidden');
  dom.larkA1Actions.classList.add('hidden');
  dom.larkA2Actions.classList.add('hidden');
  dom.larkOtherActions.classList.add('hidden');
  dom.pmAnalysisSection.classList.add('hidden');
  dom.unsupportedPage.classList.add('hidden');

  if (section === 'meegle') {
    dom.meegleAuthSection.classList.remove('hidden');
  } else if (section === 'lark_a1') {
    dom.larkAuthSection.classList.remove('hidden');
    dom.larkA1Actions.classList.remove('hidden');
  } else if (section === 'lark_a2') {
    dom.larkAuthSection.classList.remove('hidden');
    dom.larkA2Actions.classList.remove('hidden');
  } else if (section === 'lark_other') {
    dom.larkAuthSection.classList.remove('hidden');
    dom.larkOtherActions.classList.remove('hidden');
  } else if (section === 'unsupported') {
    dom.unsupportedPage.classList.remove('hidden');
  }
}

function setAuthStatus(el, status, text) {
  el.className = `auth-status ${status}`;
  el.textContent = text;
}

function setButtons(disabled) {
  // A1 buttons
  dom.analyzeBtn.disabled = disabled;
  dom.draftBtn.disabled = !state.analysisResult || disabled;
  dom.applyBtn.disabled = !state.draftResult || disabled;
  // A2 buttons
  dom.analyzeA2Btn.disabled = disabled;
  dom.draftA2Btn.disabled = !state.a2AnalysisResult || disabled;
  dom.applyA2Btn.disabled = !state.a2DraftResult || disabled;
}

// Error handling
function getErrorMessage(errorCode) {
  return ERROR_MESSAGES[errorCode] || `错误: ${errorCode}`;
}

function handleError(error, context = '') {
  const msg = error?.errorCode ? getErrorMessage(error.errorCode) : error?.message || '未知错误';
  log.error(context ? `${context}: ${msg}` : msg);

  // Update UI for recoverable errors
  if (error?.recoverable) {
    log.warn('点击刷新状态重试');
  }
}

// Page Detection
function detectPageType(url) {
  if (url.includes('project.larksuite.com') || url.includes('meegle.com')) {
    return 'meegle';
  }
  if (url.includes('feishu.cn') || url.includes('larksuite.com')) {
    if (url.includes('/a1/') || url.includes('support')) return 'lark_a1';
    if (url.includes('/a2/') || url.includes('requirement')) return 'lark_a2';
    return 'lark_other';
  }
  return 'unsupported';
}

function getPageInfo(pageType) {
  const info = {
    meegle: { icon: '🔷', text: 'Meegle 页面', subtitle: 'Meegle' },
    lark_a1: { icon: '📋', text: 'Lark 支持工单 (A1)', subtitle: 'Lark A1' },
    lark_a2: { icon: '📝', text: 'Lark 需求页面 (A2)', subtitle: 'Lark A2' },
    lark_other: { icon: '💬', text: 'Lark 页面', subtitle: 'Lark' },
    unsupported: { icon: '❓', text: '不支持', subtitle: '未知' },
  };
  return info[pageType] || info.unsupported;
}

// Auth API
async function checkMeegleAuth() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: 'itdog.meegle.auth.ensure',
        payload: {
          requestId: `req_${Date.now()}`,
          operatorLarkId: state.identity?.larkId || 'ou_current_user',
          baseUrl: CONFIG.MEEGLE_BASE_URL,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          handleError({ errorCode: 'BACKGROUND_ERROR', message: chrome.runtime.lastError.message });
          resolve({ status: 'error', error: { errorCode: 'BACKGROUND_ERROR' } });
          return;
        }

        // Handle structured error response
        if (response?.error) {
          handleError(response.error);
          resolve({ status: 'failed', error: response.error });
          return;
        }

        resolve(response?.payload || { status: 'unknown' });
      }
    );
  });
}

async function checkLarkAuth() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: 'itdog.lark.auth.ensure',
        payload: {
          requestId: `req_${Date.now()}`,
          operatorLarkId: 'ou_current_user',
          baseUrl: 'https://open.larksuite.com',
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ status: 'error' });
          return;
        }
        resolve(response?.payload || { status: 'unknown' });
      }
    );
  });
}

async function exchangeAuthCode(authCode) {
  try {
    const response = await fetch(`${CONFIG.SERVER_URL}/api/meegle/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: `req_${Date.now()}`,
        operatorLarkId: state.identity?.larkId || 'ou_current_user',
        meegleUserKey: state.identity?.meegleUserKey || 'user_key_placeholder',
        baseUrl: CONFIG.MEEGLE_BASE_URL,
        authCode,
        state: authCode,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      handleError(result.error, 'Token 交换');
      return false;
    }

    return result.ok;
  } catch (err) {
    handleError({ errorCode: 'NETWORK_ERROR', message: err.message }, 'Token 交换');
    return false;
  }
}

// Identity Resolution
async function resolveIdentity() {
  // Try to get identity from server
  try {
    const response = await fetch(`${CONFIG.SERVER_URL}/api/identity/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: `req_${Date.now()}`,
        pageType: state.pageType,
        detected: {
          larkId: null, // TODO: Get from content script
          meegleUserKey: null,
        },
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.ok && result.data) {
        state.identity = {
          larkId: result.data.operatorLarkId,
          meegleUserKey: result.data.meegleUserKey,
          mappingStatus: result.data.mappingStatus,
        };
        return result.data;
      }
    }
  } catch (err) {
    log.warn('身份解析失败，使用默认身份');
  }

  // Fallback to default identity
  state.identity = {
    larkId: 'ou_current_user',
    meegleUserKey: null,
    mappingStatus: 'unknown',
  };

  return state.identity;
}

// Actions
async function analyzePage() {
  if (!state.pageType?.startsWith('lark_')) {
    log.error('请在 Lark 页面操作');
    return;
  }

  if (state.pageType !== 'lark_a1') {
    log.error('当前仅支持 A1 页面分析');
    return;
  }

  log.add('开始分析...');
  dom.analyzeBtn.disabled = true;

  try {
    state.recordId = `rec_${Date.now()}`;
    const response = await fetch(`${CONFIG.SERVER_URL}/api/a1/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: `req_${Date.now()}`,
        operatorLarkId: state.identity?.larkId || 'ou_current_user',
        recordId: state.recordId,
        pageContext: {
          pageType: state.pageType,
          baseId: 'app_sample',
          tableId: 'tbl_sample',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      handleError(result.error, '分析失败');
      return;
    }

    if (result.ok && result.data) {
      state.analysisResult = result.data;
      log.success(`分析完成: ${result.data.summary || '完成'}`);
      if (result.data.decision) log.add(`建议: ${result.data.decision}`);
      dom.draftBtn.disabled = false;
    }
  } catch (err) {
    handleError({ errorCode: 'NETWORK_ERROR', message: err.message }, '分析失败');
  } finally {
    dom.analyzeBtn.disabled = false;
  }
}

async function generateDraft() {
  if (!state.analysisResult) {
    log.error('请先分析页面');
    return;
  }

  if (state.meegleAuth.status !== 'ready' && state.meegleAuth.status !== 'authenticated') {
    log.error('请先完成 Meegle 认证');
    return;
  }

  log.add('生成草稿...');
  dom.draftBtn.disabled = true;

  try {
    const response = await fetch(`${CONFIG.SERVER_URL}/api/a1/create-b2-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: `req_${Date.now()}`,
        operatorLarkId: state.identity?.larkId || 'ou_current_user',
        recordId: state.recordId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      handleError(result.error, '草稿生成失败');
      return;
    }

    if (result.ok && result.data) {
      state.draftResult = result.data;
      log.success('草稿生成: ' + (result.data.draft?.name || '完成'));
      if (result.data.target?.projectKey) log.add(`目标项目: ${result.data.target.projectKey}`);
      dom.applyBtn.disabled = false;
    }
  } catch (err) {
    handleError({ errorCode: 'NETWORK_ERROR', message: err.message }, '草稿生成失败');
  } finally {
    dom.draftBtn.disabled = false;
  }
}

async function applyDraft() {
  if (!state.draftResult) {
    log.error('请先生成草稿');
    return;
  }

  if (!confirm('确认创建此工作项吗？')) {
    return;
  }

  log.add('创建工作项...');
  dom.applyBtn.disabled = true;

  try {
    const response = await fetch(`${CONFIG.SERVER_URL}/api/a1/apply-b2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: `req_${Date.now()}`,
        draftId: state.draftResult.draftId,
        operatorLarkId: state.identity?.larkId || 'ou_current_user',
        sourceRecordId: state.recordId,
        idempotencyKey: `idem_${Date.now()}`,
        confirmedDraft: state.draftResult.draft,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      handleError(result.error, '创建失败');
      return;
    }

    if (result.ok) {
      log.success('创建成功: ' + result.data.workitemId);
      log.add(`工作项: ${result.data.workitemKey}`);
      dom.headerSubtitle.textContent = '创建成功 ✓';
    }
  } catch (err) {
    handleError({ errorCode: 'NETWORK_ERROR', message: err.message }, '创建失败');
  } finally {
    dom.applyBtn.disabled = false;
  }
}

// A2 Flow: 需求 → B1
async function analyzeA2Page() {
  log.add('开始分析需求...');
  dom.analyzeA2Btn.disabled = true;

  try {
    state.a2RecordId = `rec_a2_${Date.now()}`;
    const response = await fetch(`${CONFIG.SERVER_URL}/api/a2/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: `req_${Date.now()}`,
        operatorLarkId: state.identity?.larkId || 'ou_current_user',
        recordId: state.a2RecordId,
        pageContext: {
          pageType: state.pageType,
          baseId: 'app_sample',
          tableId: 'tbl_A2',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      handleError(result.error, '分析失败');
      return;
    }

    if (result.ok && result.data) {
      state.a2AnalysisResult = result.data;
      log.success(`分析完成: ${result.data.summary || '完成'}`);
      if (result.data.decision) log.add(`建议: ${result.data.decision}`);
      dom.draftA2Btn.disabled = false;
    }
  } catch (err) {
    handleError({ errorCode: 'NETWORK_ERROR', message: err.message }, '分析失败');
  } finally {
    dom.analyzeA2Btn.disabled = false;
  }
}

async function generateA2Draft() {
  if (!state.a2AnalysisResult) {
    log.error('请先分析需求');
    return;
  }

  if (state.meegleAuth.status !== 'ready' && state.meegleAuth.status !== 'authenticated') {
    log.error('请先完成 Meegle 认证');
    return;
  }

  log.add('生成需求草稿...');
  dom.draftA2Btn.disabled = true;

  try {
    const response = await fetch(`${CONFIG.SERVER_URL}/api/a2/create-b1-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: `req_${Date.now()}`,
        operatorLarkId: state.identity?.larkId || 'ou_current_user',
        recordId: state.a2RecordId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      handleError(result.error, '草稿生成失败');
      return;
    }

    if (result.ok && result.data) {
      state.a2DraftResult = result.data;
      log.success('草稿生成: ' + (result.data.draft?.name || '完成'));
      if (result.data.target?.projectKey) log.add(`目标项目: ${result.data.target.projectKey}`);
      dom.applyA2Btn.disabled = false;
    }
  } catch (err) {
    handleError({ errorCode: 'NETWORK_ERROR', message: err.message }, '草稿生成失败');
  } finally {
    dom.draftA2Btn.disabled = false;
  }
}

async function applyA2Draft() {
  if (!state.a2DraftResult) {
    log.error('请先生成草稿');
    return;
  }

  if (!confirm('确认创建此需求吗？')) {
    return;
  }

  log.add('创建需求...');
  dom.applyA2Btn.disabled = true;

  try {
    const response = await fetch(`${CONFIG.SERVER_URL}/api/a2/apply-b1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: `req_${Date.now()}`,
        draftId: state.a2DraftResult.draftId,
        operatorLarkId: state.identity?.larkId || 'ou_current_user',
        sourceRecordId: state.a2RecordId,
        idempotencyKey: `idem_${Date.now()}`,
        confirmedDraft: state.a2DraftResult.draft,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      handleError(result.error, '创建失败');
      return;
    }

    if (result.ok) {
      log.success('创建成功: ' + result.data.workitemId);
      log.add(`需求: ${result.data.workitemKey}`);
      dom.headerSubtitle.textContent = '创建成功 ✓';
    }
  } catch (err) {
    handleError({ errorCode: 'NETWORK_ERROR', message: err.message }, '创建失败');
  } finally {
    dom.applyA2Btn.disabled = false;
  }
}

// PM Analysis
function showPmAnalysis() {
  dom.pmAnalysisSection.classList.remove('hidden');
}

function hidePmAnalysis() {
  dom.pmAnalysisSection.classList.add('hidden');
  dom.pmResult.style.display = 'none';
}

async function runPmAnalysis() {
  const timeRange = dom.pmTimeRange.value;
  const days = parseInt(timeRange.replace('d', ''));
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  log.add('开始 PM 分析...');
  dom.runPmAnalysisBtn.disabled = true;

  try {
    const response = await fetch(`${CONFIG.SERVER_URL}/api/pm/analysis/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: `req_${Date.now()}`,
        operatorLarkId: state.identity?.larkId || 'ou_current_user',
        scope: {
          projectKeys: [], // All projects
          timeRange: {
            from: from.toISOString().split('T')[0],
            to: to.toISOString().split('T')[0],
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      handleError(result.error, '分析失败');
      return;
    }

    if (result.ok) {
      log.success('分析完成');
      displayPmResult(result.data);
    }
  } catch (err) {
    handleError({ errorCode: 'NETWORK_ERROR', message: err.message }, '分析失败');
  } finally {
    dom.runPmAnalysisBtn.disabled = false;
  }
}

function displayPmResult(data) {
  dom.pmResult.style.display = 'block';

  // Escape HTML to prevent XSS
  const escapeHtml = (str) => {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  const summary = escapeHtml(data.summary);
  const blockers = data.blockers?.length || 0;
  const staleItems = data.staleItems?.length || 0;
  const missingDesc = data.missingDescriptionItems?.length || 0;

  dom.pmResult.innerHTML = `
    <div style="margin-bottom: 8px;"><strong>摘要:</strong> ${summary || '无'}</div>
    ${blockers ? `<div style="color: var(--error);">阻塞项: ${blockers}</div>` : ''}
    ${staleItems ? `<div style="color: var(--warning);">过期项: ${staleItems}</div>` : ''}
    ${missingDesc ? `<div style="color: var(--text-muted);">缺少描述: ${missingDesc}</div>` : ''}
  `;
}

// Init
async function init() {
  log.add('初始化...');

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab || !tab.url) {
      showSection('unsupported');
      dom.pageTypeText.textContent = '无法获取当前页面';
      log.warn('无法获取当前标签页');
      return;
    }

    state.url = tab.url;
    state.pageType = detectPageType(tab.url);

    const info = getPageInfo(state.pageType);
    dom.pageIcon.textContent = info.icon;
    dom.pageTypeText.textContent = info.text;
    dom.pageUrl.textContent = tab.url;
    dom.headerSubtitle.textContent = info.subtitle;

    // Resolve identity first
    await resolveIdentity();

    if (state.identity.mappingStatus === 'bound') {
      log.success(`身份已绑定: ${state.identity.meegleUserKey}`);
    } else if (state.identity.mappingStatus === 'unbound') {
      log.warn('身份未绑定，部分功能受限');
    }

    if (state.pageType === 'meegle') {
      showSection('meegle');
      await refreshMeegleAuth();
    } else if (state.pageType === 'lark_a1') {
      showSection('lark_a1');
      setButtons(false);
      await refreshLarkAuth();
    } else if (state.pageType === 'lark_a2') {
      showSection('lark_a2');
      setButtons(false);
      await refreshLarkAuth();
    } else if (state.pageType === 'lark_other') {
      showSection('lark_other');
      await refreshLarkAuth();
    } else {
      showSection('unsupported');
    }

    log.success('页面检测完成');
  } catch (err) {
    handleError(err, '初始化失败');
  }
}

async function refreshMeegleAuth() {
  const auth = await checkMeegleAuth();
  state.meegleAuth = { status: auth.status, authCode: auth.authCode };

  const statusMap = {
    ready: ['ready', '已认证'],
    require_auth_code: ['pending', '需登录'],
    authenticated: ['ready', '已认证'],
    failed: ['error', '失败'],
    error: ['error', '错误'],
  };

  const [cls, text] = statusMap[auth.status] || ['pending', '未知'];
  setAuthStatus(dom.meegleAuthStatus, cls, text);

  if (auth.authCode) {
    dom.meegleAuthBtn.textContent = '交换 Token';
  } else if (auth.status === 'require_auth_code') {
    dom.meegleAuthBtn.textContent = '前往登录';
  } else {
    dom.meegleAuthBtn.textContent = '获取认证';
  }
}

async function refreshLarkAuth() {
  const [meegleAuth, larkAuth] = await Promise.all([checkMeegleAuth(), checkLarkAuth()]);

  state.meegleAuth = { status: meegleAuth.status, authCode: meegleAuth.authCode };
  state.larkAuth = { status: larkAuth.status };

  const meegleStatus = meegleAuth.status === 'ready' ? ['ready', '已认证'] : ['pending', '未认证'];
  const larkStatus = larkAuth.status === 'ready' ? ['ready', '已认证'] : ['pending', '未认证'];

  setAuthStatus(dom.larkMeegleAuthStatus, ...meegleStatus);
  setAuthStatus(dom.larkLarkAuthStatus, ...larkStatus);
}

// Event Listeners
// A1 flow
dom.analyzeBtn.addEventListener('click', analyzePage);
dom.draftBtn.addEventListener('click', generateDraft);
dom.applyBtn.addEventListener('click', applyDraft);

// A2 flow
dom.analyzeA2Btn.addEventListener('click', analyzeA2Page);
dom.draftA2Btn.addEventListener('click', generateA2Draft);
dom.applyA2Btn.addEventListener('click', applyA2Draft);

// PM Analysis
dom.pmAnalysisBtn.addEventListener('click', showPmAnalysis);
dom.closePmAnalysisBtn.addEventListener('click', hidePmAnalysis);
dom.runPmAnalysisBtn.addEventListener('click', runPmAnalysis);

dom.meegleAuthBtn.addEventListener('click', async () => {
  if (state.meegleAuth.authCode) {
    log.add('交换 Token...');
    const ok = await exchangeAuthCode(state.meegleAuth.authCode);
    if (ok) {
      state.meegleAuth.status = 'authenticated';
      setAuthStatus(dom.meegleAuthStatus, 'ready', '已认证');
      dom.meegleAuthBtn.textContent = '重新认证';
      log.success('认证成功');
    } else {
      setAuthStatus(dom.meegleAuthStatus, 'error', '失败');
      log.error('认证失败');
    }
  } else if (state.meegleAuth.status === 'require_auth_code') {
    chrome.tabs.create({ url: CONFIG.MEEGLE_BASE_URL, active: true });
  } else {
    await refreshMeegleAuth();
  }
});

dom.meegleRefreshBtn.addEventListener('click', async () => {
  log.add('刷新状态...');
  await refreshMeegleAuth();
  log.success('已更新');
});

dom.clearLogBtn.addEventListener('click', () => log.clear());

// Start
init();