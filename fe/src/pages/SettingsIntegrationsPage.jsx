import { formatDateTime } from "../lib/formatters.js";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";

function LarkAuthorizationCard({ authorization, onReauthorize }) {
  const ready = authorization?.status === "ready";
  return <section className="profile-card">
    <div className="profile-card__heading">
      <div><p className="profile-card__eyebrow">Authorization</p><h2>Lark</h2></div>
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
      <div><p className="profile-card__eyebrow">Authorization</p><h2>Meegle</h2></div>
      <span className={`status-badge ${ready ? "status-badge--ready" : "status-badge--attention"}`}>
        <span />{ready ? "已授权" : "需要授权"}
      </span>
    </div>
    <p className="profile-card__description">{ready
      ? "Meegle 授权已由 Octo 服务端保存。"
      : "请在 Meegle 页面使用 Octo 插件完成授权后重试。"}</p>
  </section>;
}

function GitHubIdentityCard({ githubId }) {
  const linked = Boolean(githubId);
  return <section className="profile-card">
    <div className="profile-card__heading">
      <div><p className="profile-card__eyebrow">Identity</p><h2>GitHub</h2></div>
      <span className={`status-badge ${linked ? "status-badge--ready" : "status-badge--attention"}`}>
        <span />{linked ? "已关联" : "未关联"}
      </span>
    </div>
    <dl className="authorization-details">
      <div><dt>GitHub ID</dt><dd>{githubId || "未关联"}</dd></div>
    </dl>
  </section>;
}

export function SettingsIntegrationsPage({ profile, onLogout, onReauthorize, isBusy, breadcrumbs }) {
  const user = profile.user ?? {};
  return <WorkspaceShell user={user} activePage="integrations" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}>
    <section className="profile-main integrations-page">
      <header className="integrations-hero">
        <div>
          <p className="eyebrow">INTEGRATIONS</p>
          <h1>Integrations</h1>
          <p>管理工作台的平台授权与账号关联。</p>
        </div>
        <p className="integrations-hero__hint">授权状态由 Octo 服务端安全管理。</p>
      </header>

      <section className="integration-grid" aria-label="平台集成">
        <LarkAuthorizationCard authorization={profile.larkAuthorization} onReauthorize={onReauthorize} />
        <MeegleAuthorizationCard authorization={profile.meegleAuthorization} />
        <GitHubIdentityCard githubId={user.githubId} />
      </section>
    </section>
  </WorkspaceShell>;
}
