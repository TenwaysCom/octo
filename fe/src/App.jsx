import { useCallback, useEffect, useState } from "react";
import { approveOctoPluginLogin, detectOctoExtension } from "./extension-presence.js";
import {
  getWebProfile,
  logoutWebAuthSession,
  completeOctoPluginLogin,
  startOctoPluginLogin,
  startLarkLogin,
} from "./lark-auth-api.js";

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

function ProfilePage({ profile, onLogout, onReauthorize, isBusy }) {
  const user = profile.user ?? {};
  const displayName = user.larkName || "Lark 用户";
  const authorizationReady = profile.larkAuthorization?.status === "ready";
  return <main className="workspace-layout">
    <header className="workspace-header">
      <Brand />
      <div className="workspace-header__account">
        <ProfileAvatar user={user} className="workspace-header__avatar" />
        <div><strong>{displayName}</strong><span>个人工作台</span></div>
      </div>
    </header>

    <div className="profile-workspace">
      <aside className="profile-sidebar" aria-label="个人资料导航">
        <div className="profile-sidebar__identity">
          <ProfileAvatar user={user} />
          <strong>{displayName}</strong>
          <span>{user.larkEmail || "Lark 账户"}</span>
        </div>
        <nav className="profile-nav" aria-label="个人资料分区">
          <a className="profile-nav__item profile-nav__item--active" href="#profile-general">
            <span aria-hidden="true">◉</span>个人资料
          </a>
          <a className="profile-nav__item" href="#profile-authorization">
            <span aria-hidden="true">◇</span>授权状态
          </a>
        </nav>
        <button className="profile-logout" type="button" disabled={isBusy} onClick={onLogout}>
          <span aria-hidden="true">↗</span>退出当前工作台
        </button>
      </aside>

      <section className="profile-main">
        <header className="profile-main__header">
          <div>
            <p className="eyebrow">个人工作台</p>
            <h1>个人资料</h1>
            <p>管理你的 Octo 工作台身份、Lark 与 Meegle 授权状态。</p>
          </div>
          <span className={`status-badge ${authorizationReady ? "status-badge--ready" : "status-badge--attention"}`}>
            <span />{authorizationReady ? "Lark 已授权" : "需要重新授权"}
          </span>
        </header>

        <nav className="profile-tabs" aria-label="个人资料标签">
          <a className="profile-tabs__item profile-tabs__item--active" href="#profile-general">概览</a>
          <a className="profile-tabs__item" href="#profile-authorization">授权状态</a>
        </nav>

        <section className="profile-section" id="profile-general">
          <div className="profile-section__heading"><h2>账户信息</h2><p>由已登录的 Lark 账户提供。</p></div>
          <dl className="profile-details">
            <div><dt>姓名</dt><dd>{displayName}</dd></div>
            <div><dt>邮箱</dt><dd>{user.larkEmail || "未提供"}</dd></div>
          </dl>
        </section>

        <section className="profile-section" id="profile-authorization">
          <div className="profile-section__heading"><h2>授权状态</h2><p>授权凭据仅由 Octo 服务端保管。</p></div>
          <div className="profile-authorization-grid">
            <LarkAuthorizationCard authorization={profile.larkAuthorization} onReauthorize={onReauthorize} />
            <MeegleAuthorizationCard authorization={profile.meegleAuthorization} />
          </div>
        </section>
      </section>
    </div>
  </main>;
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

export function App({ apiBaseUrl }) {
  const [status, setStatus] = useState();
  const [isBusy, setIsBusy] = useState(false);
  const [profile, setProfile] = useState();
  const [extension, setExtension] = useState({ status: "checking" });

  const checkSession = useCallback(async () => {
    setIsBusy(true);
    const result = await getWebProfile({ apiBaseUrl });
    setProfile(result.authenticated ? result.profile : undefined);
    setStatus(result.authenticated
      ? { title: "登录成功", text: "正在进入你的 Tenways Octo 工作台。" }
      : undefined);
    setIsBusy(false);
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

  if (profile) {
    return <ProfilePage profile={profile} onLogout={() => void logout()} onReauthorize={() => startLarkLogin({ apiBaseUrl })} isBusy={isBusy} />;
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
