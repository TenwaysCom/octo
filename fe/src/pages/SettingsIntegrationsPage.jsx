import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "../lib/formatters.js";
import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";
import { listUserSshPublicKeys, registerUserSshPublicKey } from "../services/user-ssh-public-keys/user-ssh-public-keys-api.js";

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

function sshKeyErrorMessage(error) {
  if (error?.code === "SSH_PUBLIC_KEY_ALREADY_REGISTERED") return "该 SSH 公钥已被绑定。";
  if (error?.code === "SSH_PUBLIC_KEY_INVALID") return "SSH 公钥格式无效，请粘贴单行 .pub 内容。";
  return "操作失败，请稍后重试。";
}

function newActionRunId() {
  return globalThis.crypto?.randomUUID?.() ?? `ssh-key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function SshPublicKeyCard({ apiBaseUrl }) {
  const [keys, setKeys] = useState();
  const [publicKey, setPublicKey] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setKeys(await listUserSshPublicKeys({ apiBaseUrl }));
    } catch (loadError) {
      setKeys([]);
      setError(sshKeyErrorMessage(loadError));
    }
  }, [apiBaseUrl]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event) {
    event.preventDefault();
    if (!publicKey.trim()) return;
    setSaving(true);
    setError("");
    try {
      const key = await registerUserSshPublicKey({ apiBaseUrl, publicKey, actionRunId: newActionRunId() });
      setKeys((current) => [key, ...(current ?? [])]);
      setPublicKey("");
    } catch (registerError) {
      setError(sshKeyErrorMessage(registerError));
    } finally {
      setSaving(false);
    }
  }

  const activeKeys = keys?.filter((key) => key.status === "active") ?? [];
  return <section className="profile-card ssh-key-card">
    <div className="profile-card__heading">
      <div><p className="profile-card__eyebrow">Internal API</p><h2>SSH Key</h2></div>
      <span className={`status-badge ${activeKeys.length > 0 ? "status-badge--ready" : "status-badge--attention"}`}>
        <span />{keys === undefined ? "读取中" : activeKeys.length > 0 ? `已配置 ${activeKeys.length} 个` : "未配置"}
      </span>
    </div>
    <p className="profile-card__description">绑定给当前 Octo 用户。只保存公钥；私钥不会上传或保存。</p>
    {keys?.length ? <ul className="ssh-key-card__list" aria-label="当前 SSH 公钥">
      {keys.map((key) => <li key={key.publicKeyFingerprint}>
        <code>{key.publicKey}</code>
        <span>{key.publicKeyFingerprint} · {key.status === "active" ? "有效" : key.status} · {formatDateTime(key.createdAt)}</span>
      </li>)}
    </ul> : keys !== undefined ? <p className="ssh-key-card__empty">尚未添加 SSH 公钥。</p> : null}
    <form className="ssh-key-card__form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="ssh-public-key">新增 SSH 公钥</label>
      <textarea
        id="ssh-public-key"
        value={publicKey}
        onChange={(event) => setPublicKey(event.target.value)}
        placeholder="ssh-ed25519 AAAA... user@host"
        spellCheck="false"
        disabled={saving}
      />
      <div>
        <span>提交前会按公钥 SHA256 指纹查重。</span>
        <button className="secondary-button" type="submit" disabled={saving || !publicKey.trim()}>{saving ? "添加中…" : "添加 SSH Key"}</button>
      </div>
    </form>
    {error ? <p className="profile-card__error" role="alert">{error}</p> : null}
  </section>;
}

export function SettingsIntegrationsPage({ profile, apiBaseUrl, onLogout, onReauthorize, isBusy, breadcrumbs }) {
  const user = profile.user ?? {};
  return <WorkspaceShell user={user} workspaceAccess={profile.workspaceAccess} activePage="integrations" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}>
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
        <SshPublicKeyCard apiBaseUrl={apiBaseUrl} />
      </section>
    </section>
  </WorkspaceShell>;
}
