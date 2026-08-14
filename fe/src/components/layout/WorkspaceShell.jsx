import { createContext, useContext, useEffect, useState } from "react";
import { getIntegrationsSubroutes, getWorkspaceNavigationRoutes, INTEGRATIONS_ROUTE, INTEGRATIONS_SUBROUTES } from "../../app/routes/workspace-routes.js";

export const WorkspaceMetricsContext = createContext({ githubMyOpenCount: undefined });

export function Brand() {
  return <a className="brand" href="/" aria-label="Tenways Octo 首页">
    <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
    <span>Tenways Octo</span>
  </a>;
}

export function ProfileAvatar({ user, className = "" }) {
  const displayName = user.larkName || "Lark 用户";
  return <div className={`profile-avatar ${className}`.trim()} aria-hidden="true">
    {user.larkAvatarUrl ? <img src={user.larkAvatarUrl} alt="" /> : displayName.slice(0, 1)}
  </div>;
}

function WorkspaceSidebar({ activePage, workspaceAccess, githubMyOpenCount }) {
  const isIntegrationsPage = INTEGRATIONS_SUBROUTES.some((route) => route.page === activePage);
  const integrationsSubroutes = getIntegrationsSubroutes(workspaceAccess);
  const [integrationsOpen, setIntegrationsOpen] = useState(isIntegrationsPage);

  useEffect(() => {
    if (isIntegrationsPage) {
      setIntegrationsOpen(true);
    }
  }, [isIntegrationsPage]);

  return <aside className="profile-sidebar" aria-label="工作台导航">
    <header className="profile-sidebar__header"><Brand /></header>
    <nav className="profile-nav" aria-label="工作台分区">
      <p className="profile-nav__label">WORKSPACE</p>
      {getWorkspaceNavigationRoutes(workspaceAccess).map((route) => <a
        className={`profile-nav__item ${activePage === route.page ? "profile-nav__item--active" : ""}`.trim()}
        href={route.hash}
        key={route.page}
      >
        <span className="profile-nav__item-label"><i aria-hidden="true">{route.icon}</i>{route.label}</span>
        {route.page === "github-pull-requests" && Number.isInteger(githubMyOpenCount)
          ? <span className="profile-nav__count" aria-label={`${githubMyOpenCount} 个 My Open PR`} title="My Open PR">{githubMyOpenCount}</span>
          : null}
      </a>)}
      <div className={`profile-nav__group profile-nav__group--settings ${integrationsOpen ? "profile-nav__group--active" : ""}`.trim()}>
        <a
          className="profile-nav__item"
          href={INTEGRATIONS_ROUTE.hash}
          aria-expanded={integrationsOpen}
          onClick={() => setIntegrationsOpen((open) => isIntegrationsPage ? !open : true)}
        >
          <span className="profile-nav__item-label"><i aria-hidden="true">{INTEGRATIONS_ROUTE.icon}</i>设置</span>
          <i className={`profile-nav__chevron ${integrationsOpen ? "profile-nav__chevron--open" : ""}`.trim()} aria-hidden="true">⌄</i>
        </a>
        {integrationsOpen ? <div className="profile-nav__subitems">
          {integrationsSubroutes.map((route) => <a
            className={`profile-nav__subitem ${activePage === route.page ? "profile-nav__subitem--active" : ""}`.trim()}
            href={route.hash}
            key={route.page}
          >{route.label}</a>)}
        </div> : null}
      </div>
    </nav>
  </aside>;
}

function WorkspaceHeader({ user, workspaceAccess, onLogout, isBusy }) {
  const displayName = user.larkName || "Lark 用户";
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="workspace-header">
    <div className="workspace-header__account-menu">
      <button
        className="workspace-header__account"
        type="button"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <ProfileAvatar user={user} className="workspace-header__avatar" />
        <div className="workspace-header__account-details"><strong>{displayName}</strong><span>个人工作台</span></div>
        <i className={menuOpen ? "workspace-header__chevron workspace-header__chevron--open" : "workspace-header__chevron"} aria-hidden="true">⌄</i>
      </button>
      {menuOpen ? <div className="workspace-header__account-menu-items" role="menu">
        {workspaceAccess?.platformSync ? <a href="#sync" role="menuitem" onClick={() => setMenuOpen(false)}>数据同步</a> : null}
        <button type="button" role="menuitem" disabled={isBusy} onClick={() => void onLogout()}>退出登录</button>
      </div> : null}
    </div>
  </header>;
}

function WorkspaceBreadcrumbs({ items }) {
  if (!items.length) return null;
  return <nav className="workspace-breadcrumbs" aria-label="面包屑导航">
    {items.map((item, index) => index === items.length - 1
      ? <span aria-current="page" key={item.hash}>{item.label}</span>
      : <a href={item.hash} key={item.hash}>{item.label}</a>)}
  </nav>;
}

export function WorkspaceShell({ user, workspaceAccess, activePage, onLogout, isBusy, breadcrumbs = [], children }) {
  const { githubMyOpenCount } = useContext(WorkspaceMetricsContext);
  return <main className="workspace-layout">
    <WorkspaceSidebar activePage={activePage} workspaceAccess={workspaceAccess} githubMyOpenCount={githubMyOpenCount} />
    <div className="workspace-content">
      <WorkspaceHeader user={user} workspaceAccess={workspaceAccess} onLogout={onLogout} isBusy={isBusy} />
      <WorkspaceBreadcrumbs items={breadcrumbs} />
      {children}
    </div>
  </main>;
}
