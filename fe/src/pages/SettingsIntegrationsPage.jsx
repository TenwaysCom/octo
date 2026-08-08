import { formatDateTime } from "../lib/formatters.js";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";

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

export function SettingsIntegrationsPage({ profile, onLogout, onReauthorize, isBusy }) {
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
            <p>查看已连接的平台与授权状态。</p>
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
