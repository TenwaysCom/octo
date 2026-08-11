import { useEffect, useState } from "react";
import { SETTINGS_ROUTE, SETTINGS_SUBROUTES, WORKSPACE_NAVIGATION_ROUTES } from "../../app/routes/workspace-routes.js";

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
  const isSettingsPage = SETTINGS_SUBROUTES.some((route) => route.page === activePage);
  const [settingsOpen, setSettingsOpen] = useState(isSettingsPage);

  useEffect(() => {
    if (isSettingsPage) {
      setSettingsOpen(true);
    }
  }, [isSettingsPage]);

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
      <div className={`profile-nav__group ${settingsOpen ? "profile-nav__group--active" : ""}`.trim()}>
        <a
          className="profile-nav__item"
          href={SETTINGS_ROUTE.hash}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => isSettingsPage ? !open : true)}
        >
          <span className="profile-nav__item-label"><i aria-hidden="true">{SETTINGS_ROUTE.icon}</i>{SETTINGS_ROUTE.label}</span>
          <i className={`profile-nav__chevron ${settingsOpen ? "profile-nav__chevron--open" : ""}`.trim()} aria-hidden="true">⌄</i>
        </a>
        {settingsOpen ? <div className="profile-nav__subitems">
          {SETTINGS_SUBROUTES.map((route) => <a
            className={`profile-nav__subitem ${activePage === route.page ? "profile-nav__subitem--active" : ""}`.trim()}
            href={route.hash}
            key={route.page}
          >{route.label}</a>)}
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

export function WorkspaceShell({ user, activePage, onLogout, isBusy, children }) {
  return <main className="workspace-layout">
    <WorkspaceSidebar activePage={activePage} onLogout={onLogout} isBusy={isBusy} />
    <div className="workspace-content">
      <WorkspaceHeader user={user} />
      {children}
    </div>
  </main>;
}
