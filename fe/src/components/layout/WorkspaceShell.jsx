import { useEffect, useState } from "react";
import { INTEGRATIONS_ROUTE, INTEGRATIONS_SUBROUTES, WORKSPACE_NAVIGATION_ROUTES } from "../../app/routes/workspace-routes.js";

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

function WorkspaceSidebar({ activePage, onLogout, isBusy }) {
  const isIntegrationsPage = INTEGRATIONS_SUBROUTES.some((route) => route.page === activePage);
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
      {WORKSPACE_NAVIGATION_ROUTES.map((route) => <a
        className={`profile-nav__item ${activePage === route.page ? "profile-nav__item--active" : ""}`.trim()}
        href={route.hash}
        key={route.page}
      >
        <span className="profile-nav__item-label"><i aria-hidden="true">{route.icon}</i>{route.label}</span>
      </a>)}
      <div className={`profile-nav__group ${integrationsOpen ? "profile-nav__group--active" : ""}`.trim()}>
        <a
          className="profile-nav__item"
          href={INTEGRATIONS_ROUTE.hash}
          aria-expanded={integrationsOpen}
          onClick={() => setIntegrationsOpen((open) => isIntegrationsPage ? !open : true)}
        >
          <span className="profile-nav__item-label"><i aria-hidden="true">{INTEGRATIONS_ROUTE.icon}</i>Settings</span>
          <i className={`profile-nav__chevron ${integrationsOpen ? "profile-nav__chevron--open" : ""}`.trim()} aria-hidden="true">⌄</i>
        </a>
        {integrationsOpen ? <div className="profile-nav__subitems">
          {INTEGRATIONS_SUBROUTES.map((route) => <a
            className={`profile-nav__subitem ${activePage === route.page ? "profile-nav__subitem--active" : ""}`.trim()}
            href={route.hash}
            key={route.page}
          >{route.label}</a>)}
          <button className="profile-nav__subitem profile-nav__subitem--button" type="button" disabled={isBusy} onClick={onLogout}>
            退出当前工作台
          </button>
        </div> : null}
      </div>
    </nav>
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

function WorkspaceBreadcrumbs({ items }) {
  if (!items.length) return null;
  return <nav className="workspace-breadcrumbs" aria-label="面包屑导航">
    {items.map((item, index) => index === items.length - 1
      ? <span aria-current="page" key={item.hash}>{item.label}</span>
      : <a href={item.hash} key={item.hash}>{item.label}</a>)}
  </nav>;
}

export function WorkspaceShell({ user, activePage, onLogout, isBusy, breadcrumbs = [], children }) {
  return <main className="workspace-layout">
    <WorkspaceSidebar activePage={activePage} onLogout={onLogout} isBusy={isBusy} />
    <div className="workspace-content">
      <WorkspaceHeader user={user} />
      <WorkspaceBreadcrumbs items={breadcrumbs} />
      {children}
    </div>
  </main>;
}
