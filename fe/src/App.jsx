import { useCallback, useEffect, useState } from "react";
import { approveOctoPluginLogin, detectOctoExtension } from "./extension-presence.js";
import {
  getWebProfile,
  logoutWebAuthSession,
  completeOctoPluginLogin,
  startOctoPluginLogin,
  startLarkLogin,
} from "./lark-auth-api.js";
import { getPlatformDataList } from "./platform-data-api.js";

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function Brand() {
  return <a className="brand" href="/" aria-label="Tenways Octo 首页">
    <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
    <span>Tenways Octo</span>
  </a>;
}

function ProfileAvatar({ user, className = "" }) {
  const displayName = user.larkName || "Lark 用户";
  return <div className={`profile-avatar ${className}`.trim()} aria-hidden="true">
    {user.larkAvatarUrl ? <img src={user.larkAvatarUrl} alt="" /> : displayName.slice(0, 1)}
  </div>;
}

const WORKSPACE_PAGES = {
  "lark-tickets": { hash: "#lark-tickets", label: "Lark Ticket", icon: "◫" },
  "meegle-workitems": { hash: "#meegle-workitems", label: "Meegle", icon: "◇" },
  "github-pull-requests": { hash: "#github-pull-requests", label: "GitHub PR", icon: "↗" },
};
const SETTINGS_PAGE = { hash: "#settings", label: "Settings", icon: "⚙" };
const WORKSPACE_PAGE_TITLES = {
  settings: "Settings",
  "lark-tickets": "Lark Ticket",
  "meegle-workitems": "Meegle",
  "github-pull-requests": "GitHub PR",
};
const LIST_PAGE_SIZE = 50;
const DATE_FILTERS = [
  ["all-time", "全部时间"],
  ["today", "今天"],
  ["last-7-days", "最近 7 天"],
  ["last-month", "最近一个月"],
  ["last-12-months", "最近一年"],
];

function getWorkspacePage(hash) {
  return [...Object.entries(WORKSPACE_PAGES), ["settings", SETTINGS_PAGE]]
    .find(([, page]) => page.hash === hash)?.[0] || "settings";
}

function WorkspaceSidebar({ activePage, onLogout, isBusy }) {
  const [settingsOpen, setSettingsOpen] = useState(activePage === "settings");

  useEffect(() => {
    if (activePage === "settings") {
      setSettingsOpen(true);
    }
  }, [activePage]);

  return <aside className="profile-sidebar" aria-label="工作台导航">
    <header className="profile-sidebar__header"><Brand /></header>
    <nav className="profile-nav" aria-label="工作台分区">
      <p className="profile-nav__label">WORKSPACE</p>
      {Object.entries(WORKSPACE_PAGES).map(([key, page]) => <a
        className={`profile-nav__item ${activePage === key ? "profile-nav__item--active" : ""}`.trim()}
        href={page.hash}
        key={key}
      >
        <span className="profile-nav__item-label"><i aria-hidden="true">{page.icon}</i>{page.label}</span>
      </a>)}
      <div className={`profile-nav__group ${activePage === "settings" ? "profile-nav__group--active" : ""}`.trim()}>
        <a
          className="profile-nav__item"
          href={SETTINGS_PAGE.hash}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => activePage === "settings" ? !open : true)}
        >
          <span className="profile-nav__item-label"><i aria-hidden="true">{SETTINGS_PAGE.icon}</i>{SETTINGS_PAGE.label}</span>
          <i className={`profile-nav__chevron ${settingsOpen ? "profile-nav__chevron--open" : ""}`.trim()} aria-hidden="true">⌄</i>
        </a>
        {settingsOpen ? <div className="profile-nav__subitems">
          <a className="profile-nav__subitem profile-nav__subitem--active" href="#settings-integrations">Integrations</a>
        </div> : null}
      </div>
    </nav>
    <button className="profile-logout" type="button" disabled={isBusy} onClick={onLogout}>
      <span aria-hidden="true">↗</span>退出当前工作台
    </button>
  </aside>;
}

function WorkspaceHeader({ user }) {
  const displayName = user.larkName || "Lark 用户";
  return <header className="workspace-header">
    <div className="workspace-header__account">
      <ProfileAvatar user={user} className="workspace-header__avatar" />
      <div><strong>{displayName}</strong><span>个人工作台</span></div>
    </div>
  </header>;
}

function WorkspaceShell({ user, activePage, onLogout, isBusy, children }) {
  return <main className="workspace-layout">
    <WorkspaceSidebar activePage={activePage} onLogout={onLogout} isBusy={isBusy} />
    <div className="workspace-content">
      <WorkspaceHeader user={user} />
      {children}
    </div>
  </main>;
}

function LarkAuthorizationCard({ authorization, onReauthorize }) {
  const ready = authorization?.status === "ready";
  return <section className="profile-card">
    <div className="profile-card__heading">
      <div><p className="profile-card__eyebrow">Lark</p><h2>Lark 授权</h2></div>
      <span className={`status-badge ${ready ? "status-badge--ready" : "status-badge--attention"}`}>
        <span />{ready ? "已授权" : "需要重新授权"}
      </span>
    </div>
    <dl className="authorization-details">
      <div><dt>最近授权</dt><dd>{formatDateTime(authorization?.authorizedAt)}</dd></div>
      <div><dt>令牌到期</dt><dd>{ready ? formatDateTime(authorization?.expiresAt) : "请重新授权"}</dd></div>
    </dl>
    {!ready ? <button className="secondary-button" type="button" onClick={onReauthorize}>使用 Lark 重新授权</button> : null}
  </section>;
}

function MeegleAuthorizationCard({ authorization }) {
  const ready = authorization?.status === "ready";
  return <section className="profile-card">
    <div className="profile-card__heading">
      <div><p className="profile-card__eyebrow">Meegle</p><h2>Meegle 授权</h2></div>
      <span className={`status-badge ${ready ? "status-badge--ready" : "status-badge--attention"}`}>
        <span />{ready ? "已授权" : "需要授权"}
      </span>
    </div>
    <p className="profile-card__description">{ready
      ? "Meegle 授权已由 Octo 服务端保存。"
      : "请在 Meegle 页面使用 Octo 插件完成授权后重试。"}</p>
  </section>;
}

function SettingsIntegrationsPage({ profile, onLogout, onReauthorize, isBusy }) {
  const user = profile.user ?? {};
  return <WorkspaceShell user={user} activePage="settings" onLogout={onLogout} isBusy={isBusy}>
      <section className="profile-main">
        <header className="profile-main__header">
          <div>
            <p className="eyebrow">WORKSPACE SETTINGS</p>
            <h1>Settings</h1>
            <p>管理 Octo 工作台已接入的平台与授权状态。</p>
          </div>
        </header>

        <section className="settings-panel" id="settings-integrations">
          <nav className="settings-panel__nav" aria-label="设置分区">
            <p>WORKSPACE SETTINGS</p>
            <a className="settings-panel__nav-item settings-panel__nav-item--active" href="#settings-integrations">
              <span aria-hidden="true">◇</span>Integrations
            </a>
          </nav>
          <div className="settings-panel__body">
            <header className="settings-panel__heading">
              <h2>Integrations</h2>
              <p>查看已连接的平台及其授权状态。</p>
            </header>
            <div className="integration-grid">
            <LarkAuthorizationCard authorization={profile.larkAuthorization} onReauthorize={onReauthorize} />
            <MeegleAuthorizationCard authorization={profile.meegleAuthorization} />
            </div>
          </div>
        </section>
      </section>
  </WorkspaceShell>;
}

function ExternalLink({ href, children }) {
  try {
    const url = new URL(href);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return <a className="table-link" href={url.toString()} target="_blank" rel="noreferrer">{children}</a>;
    }
  } catch {
    // Synced fields may be empty or a non-URL value; render plain text in that case.
  }
  return children;
}

function StatusPill({ children }) {
  return <span className="list-status">{children || "-"}</span>;
}

function filterPlatformItems(items, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => Object.values(item).some((value) => String(value ?? "")
    .toLocaleLowerCase()
    .includes(normalizedQuery)));
}

function getPlatformItemStatus(kind, item) {
  if (kind === "lark-tickets") {
    return item.ticketStatus || "未设置";
  }
  if (kind === "meegle-workitems") {
    return item.status || "未设置";
  }
  return item.isDraft ? "Draft" : item.state || "未设置";
}

function matchesDateFilter(item, dateFilter) {
  if (dateFilter === "all-time") {
    return true;
  }

  const updatedAt = new Date(item.sourceUpdatedAt || item.syncedAt || "");
  if (Number.isNaN(updatedAt.getTime())) {
    return false;
  }

  const now = new Date();
  const threshold = new Date(now);
  if (dateFilter === "today") {
    threshold.setHours(0, 0, 0, 0);
  } else if (dateFilter === "last-7-days") {
    threshold.setDate(now.getDate() - 7);
  } else if (dateFilter === "last-month") {
    threshold.setMonth(now.getMonth() - 1);
  } else {
    threshold.setFullYear(now.getFullYear() - 1);
  }
  return updatedAt >= threshold;
}

function SyncedListTable({ kind, items }) {
  if (kind === "lark-tickets") {
    return <table className="data-table"><thead><tr><th>Ticket</th><th>状态</th><th>来源</th><th>更新时间</th></tr></thead><tbody>
      {items.map((item) => <tr key={`${item.baseId}-${item.tableId}-${item.recordId}`}><td><ExternalLink href={item.sharedUrl}>{item.title}</ExternalLink><small>{item.recordId}</small></td><td><StatusPill>{item.ticketStatus}</StatusPill></td><td>{item.baseId} / {item.tableId}</td><td>{formatDateTime(item.sourceUpdatedAt || item.syncedAt)}</td></tr>)}
    </tbody></table>;
  }

  if (kind === "meegle-workitems") {
    return <table className="data-table"><thead><tr><th>工作项</th><th>项目 / 类型</th><th>状态</th><th>Sprint / Version</th><th>System</th><th>负责人</th><th>更新时间</th></tr></thead><tbody>
      {items.map((item) => <tr key={`${item.projectKey}-${item.workItemTypeKey}-${item.workItemId}`}><td><strong>{item.workItemKey || item.workItemId}</strong><small>{item.title}</small></td><td>{item.projectName || item.projectKey}<small>{item.workItemType || item.workItemTypeKey}</small></td><td><StatusPill>{item.status}</StatusPill><small>{item.subStage || ""}</small></td><td>{item.sprint || "-"}<small>{item.version || "-"}</small></td><td>{item.system || "-"}</td><td>{item.assignee || "-"}</td><td>{formatDateTime(item.sourceUpdatedAt || item.syncedAt)}</td></tr>)}
    </tbody></table>;
  }

  return <table className="data-table"><thead><tr><th>Pull Request</th><th>仓库</th><th>状态</th><th>分支</th><th>更新时间</th></tr></thead><tbody>
    {items.map((item) => <tr key={`${item.owner}-${item.repo}-${item.pullNumber}`}><td><ExternalLink href={item.htmlUrl}>{item.title}</ExternalLink><small>#{item.pullNumber} {item.authorLogin ? `· ${item.authorLogin}` : ""}</small></td><td>{item.owner} / {item.repo}</td><td><StatusPill>{item.isDraft ? "Draft" : item.state}</StatusPill></td><td>{item.headRef || "-"}<small>{item.baseRef ? `→ ${item.baseRef}` : ""}</small></td><td>{formatDateTime(item.sourceUpdatedAt || item.syncedAt)}</td></tr>)}
  </tbody></table>;
}

function PlatformListPage({ profile, page, apiBaseUrl, onLogout, isBusy }) {
  const [state, setState] = useState({ status: "loading", items: [] });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all-time");
  const [filterOpen, setFilterOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const statusFilters = [...new Set(state.items.map((item) => getPlatformItemStatus(page, item)))].sort((left, right) => left.localeCompare(right));
  const filteredItems = filterPlatformItems(state.items, query)
    .filter((item) => statusFilter === "all" || getPlatformItemStatus(page, item) === statusFilter)
    .filter((item) => matchesDateFilter(item, dateFilter));
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / LIST_PAGE_SIZE));
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const pageItems = filteredItems.slice(currentPageIndex * LIST_PAGE_SIZE, (currentPageIndex + 1) * LIST_PAGE_SIZE);
  const firstResult = filteredItems.length === 0 ? 0 : currentPageIndex * LIST_PAGE_SIZE + 1;
  const lastResult = Math.min((currentPageIndex + 1) * LIST_PAGE_SIZE, filteredItems.length);

  useEffect(() => {
    setQuery("");
    setStatusFilter("all");
    setDateFilter("all-time");
    setFilterOpen(false);
    setPageIndex(0);
  }, [page]);

  useEffect(() => {
    let active = true;
    setState({ status: "loading", items: [] });
    void getPlatformDataList({ apiBaseUrl, kind: page }).then(
      (items) => { if (active) setState({ status: "ready", items }); },
      () => { if (active) setState({ status: "error", items: [] }); },
    );
    return () => { active = false; };
  }, [apiBaseUrl, page]);

  return <WorkspaceShell user={profile.user ?? {}} activePage={page} onLogout={onLogout} isBusy={isBusy}>
      <section className="profile-main list-page">
        <section className="list-section">
          {state.status === "loading" ? <p className="list-message">正在加载同步数据…</p> : null}
          {state.status === "error" ? <p className="list-message list-message--error">同步数据暂时无法读取，请稍后重试。</p> : null}
          {state.status === "ready" && state.items.length === 0 ? <p className="list-message">暂无已同步的数据。</p> : null}
          {state.status === "ready" && state.items.length > 0 ? <div className="list-toolbar">
            <div className="list-filter-tabs" role="group" aria-label="按状态筛选">
              <button className={`list-filter-tab ${statusFilter === "all" ? "list-filter-tab--active" : ""}`.trim()} type="button" onClick={() => { setStatusFilter("all"); setPageIndex(0); }}>全部</button>
              {statusFilters.map((status) => <button className={`list-filter-tab ${statusFilter === status ? "list-filter-tab--active" : ""}`.trim()} type="button" key={status} onClick={() => { setStatusFilter(status); setPageIndex(0); }}>{status}</button>)}
            </div>
            <div className="list-toolbar__actions">
              <label className="list-date-filter">
                <span className="visually-hidden">按更新时间筛选</span>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 0a1 1 0 0 1 1 1v1h6V1a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h1V1a1 1 0 0 1 1-1Zm10 6H2v8h12V6ZM2 4v1h12V4H2Z" /></svg>
                <select value={dateFilter} onChange={(event) => { setDateFilter(event.target.value); setPageIndex(0); }}>
                  {DATE_FILTERS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
                <svg className="list-date-filter__chevron" viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1 5 5 5-5" /></svg>
              </label>
              <div className="list-filter-menu">
                <button className="list-filter-button" type="button" aria-label="按关键字筛选" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M0 3a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 0 1-1-1Zm3 5a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm4 4a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2H7Z" /></svg>
                </button>
                {filterOpen ? <label className="list-filter-menu__search">
                  <span className="visually-hidden">搜索当前列表</span>
                  <input type="search" autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setPageIndex(0); }} placeholder="搜索" />
                </label> : null}
              </div>
            </div>
          </div> : null}
          {state.status === "ready" && state.items.length > 0 && filteredItems.length === 0 ? <p className="list-message">未找到匹配的数据。</p> : null}
          {state.status === "ready" && filteredItems.length > 0 ? <>
            <div className="data-table-wrap"><SyncedListTable kind={page} items={pageItems} /></div>
            <footer className="list-pagination">
              <p className="list-results">显示 <strong>{firstResult}–{lastResult}</strong> / {filteredItems.length} 条结果</p>
              <div className="list-pagination__controls">
                <button type="button" disabled={currentPageIndex === 0} onClick={() => setPageIndex((index) => Math.max(0, index - 1))}>上一页</button>
                <span>{currentPageIndex + 1} / {pageCount}</span>
                <button type="button" disabled={currentPageIndex >= pageCount - 1} onClick={() => setPageIndex((index) => Math.min(pageCount - 1, index + 1))}>下一页</button>
              </div>
            </footer>
          </> : null}
        </section>
      </section>
  </WorkspaceShell>;
}

function LoginPage({ status, isBusy, extension, onLogin, onPluginLogin }) {
  const extensionDetected = extension.status === "detected";
  return <div className="login-content">
    {status ? <section className="auth-card" aria-live="polite">
      <div className="auth-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M12 3v9h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <div><h2>{status.title}</h2><p>{status.text}</p></div>
    </section> : null}

    <div className="login-methods">
      <button className="primary-button" type="button" disabled={isBusy} onClick={onLogin}>
        <span>使用 Lark 登录</span>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="login-divider" aria-hidden="true"><span>或</span></div>
      <button className="plugin-login-button" type="button" disabled={isBusy || !extensionDetected} onClick={onPluginLogin}>
        <span className="plugin-login-button__mark" aria-hidden="true"><i /><i /><i /><i /></span>
        <span>使用 Octo 插件登录</span>
      </button>
    </div>
    <p className="help-text">{extension.status === "checking"
      ? "正在检测 Octo 插件…"
      : extensionDetected
        ? "将使用插件中已有的 Lark 授权完成登录。"
        : "未检测到 Octo 插件；你仍可使用 Lark 登录。"}</p>

  </div>;
}

function SessionLoadingPage() {
  return <main className="session-loading" aria-live="polite" aria-label="正在恢复工作台会话">
    <div className="session-loading__content">
      <Brand />
      <span className="session-loading__indicator" aria-hidden="true" />
      <p>正在恢复工作台会话…</p>
    </div>
  </main>;
}

export function App({ apiBaseUrl }) {
  const [status, setStatus] = useState();
  const [isBusy, setIsBusy] = useState(false);
  const [profile, setProfile] = useState();
  const [sessionStatus, setSessionStatus] = useState("checking");
  const [extension, setExtension] = useState({ status: "checking" });
  const [workspacePage, setWorkspacePage] = useState(() => getWorkspacePage(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setWorkspacePage(getWorkspacePage(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (sessionStatus === "checking") {
      document.title = "Tenways Octo";
      return;
    }

    document.title = profile
      ? `${WORKSPACE_PAGE_TITLES[workspacePage] || "Workspace"} · Tenways Octo`
      : "登录 · Tenways Octo";
  }, [profile, sessionStatus, workspacePage]);

  const checkSession = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await getWebProfile({ apiBaseUrl });
      setProfile(result.authenticated ? result.profile : undefined);
      setStatus(undefined);
    } finally {
      setSessionStatus("checked");
      setIsBusy(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (profile) {
      return undefined;
    }

    let active = true;
    void detectOctoExtension().then((result) => {
      if (active) {
        setExtension(result.detected ? { status: "detected", version: result.version } : { status: "missing" });
      }
    });
    return () => { active = false; };
  }, [profile]);

  const logout = useCallback(async () => {
    setIsBusy(true);
    await logoutWebAuthSession({ apiBaseUrl });
    setProfile(undefined);
    setStatus({ title: "已退出登录", text: "你的本工作台会话已结束。" });
    setIsBusy(false);
  }, [apiBaseUrl]);

  const loginWithPlugin = useCallback(async () => {
    if (extension.status !== "detected") {
      return;
    }

    setIsBusy(true);
    setStatus({ title: "正在通过插件登录", text: "正在确认插件中的 Lark 授权。" });
    try {
      const challenge = await startOctoPluginLogin({ apiBaseUrl });
      const approval = await approveOctoPluginLogin({ challengeId: challenge.challengeId });
      if (!approval.approved) {
        const message = approval.errorCode === "LARK_AUTH_REQUIRED"
          ? "插件尚未完成 Lark 授权，请在 Octo 插件中完成 Lark 授权后重试。"
          : approval.errorCode === "ENVIRONMENT_MISMATCH"
            ? "当前网页与插件所选环境不一致，请切换插件环境后重试。"
            : "无法通过 Octo 插件登录，请确认插件已安装并重试。";
        setStatus({ title: "插件登录未完成", text: message });
        return;
      }

      const completed = await completeOctoPluginLogin({ apiBaseUrl, challengeId: challenge.challengeId });
      if (!completed) {
        setStatus({ title: "插件登录未完成", text: "登录确认已失效，请重新尝试。" });
        return;
      }

      const result = await getWebProfile({ apiBaseUrl });
      if (!result.authenticated) {
        setStatus({ title: "插件登录未完成", text: "工作台会话创建失败，请重新尝试。" });
        return;
      }
      setProfile(result.profile);
      setStatus({ title: "登录成功", text: "正在进入你的 Tenways Octo 工作台。" });
    } catch {
      setStatus({ title: "插件登录未完成", text: "无法连接 Octo 服务，请稍后重试或使用 Lark 登录。" });
    } finally {
      setIsBusy(false);
    }
  }, [apiBaseUrl, extension.status]);

  if (sessionStatus === "checking") {
    return <SessionLoadingPage />;
  }

  if (profile) {
    if (workspacePage !== "settings") {
      return <PlatformListPage profile={profile} page={workspacePage} apiBaseUrl={apiBaseUrl} onLogout={() => void logout()} isBusy={isBusy} />;
    }
    return <SettingsIntegrationsPage profile={profile} onLogout={() => void logout()} onReauthorize={() => startLarkLogin({ apiBaseUrl })} isBusy={isBusy} />;
  }

  return <main className="auth-layout">
    <section className="auth-panel" aria-label="Tenways Octo 工作台">
      <header className="brand-header">
        <Brand />
        <span className="environment-badge">项目协作工作台</span>
      </header>

      <LoginPage status={status} isBusy={isBusy} extension={extension} onLogin={() => startLarkLogin({ apiBaseUrl })} onPluginLogin={() => void loginWithPlugin()} />

      <footer className="auth-footer"><span>© Tenways</span></footer>
    </section>

    <aside className="visual-panel" aria-label="Tenways Octo 产品介绍">
      <div className="visual-grid" aria-hidden="true" /><div className="visual-orb orb-one" aria-hidden="true" /><div className="visual-orb orb-two" aria-hidden="true" />
      <div className="visual-content">
        <div className="visual-label"><span /> TENWAYS OCTO</div><h2>让项目协作<br />自然流动。</h2><p>连接 Lark、Meegle 与 GitHub，在一个更清晰的工作空间里推进每一次交付。</p>
        <div className="workflow-card" aria-hidden="true"><div className="workflow-topline"><span>本周交付概览</span><span className="online-dot" /></div><div className="workflow-progress"><span /></div><div className="workflow-stats"><div><strong>24</strong><span>进行中事项</span></div><div><strong>86%</strong><span>本周完成率</span></div><div><strong>8</strong><span>待处理协作</span></div></div></div>
      </div>
    </aside>
  </main>;
}
