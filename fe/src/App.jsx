import { useCallback, useEffect, useState } from "react";
import { detectOctoExtension } from "./extension-presence.js";
import {
  getExtensionDownloadInfo,
  getWebProfile,
  logoutWebAuthSession,
  startLarkLogin,
} from "./lark-auth-api.js";

const initialStatus = {
  title: "正在检查登录状态",
  text: "正在验证你的 Tenways Octo 工作台会话。",
};

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

function MeegleExtensionCard({ extension, onInstall, installError, isInstalling }) {
  const detected = extension.status === "detected";
  const checking = extension.status === "checking";
  return <section className="profile-card">
    <div className="profile-card__heading">
      <div><p className="profile-card__eyebrow">Meegle</p><h2>插件授权</h2></div>
      <span className={`status-badge ${detected ? "status-badge--ready" : "status-badge--neutral"}`}>
        <span />{checking ? "正在检测" : detected ? "插件已安装" : "未检测到插件"}
      </span>
    </div>
    {detected ? <p className="profile-card__description">请在已登录的 Meegle 页面打开 Tenways Octo 插件，按插件内提示完成授权。</p> : <>
      <p className="profile-card__description">安装插件后，可在 Meegle 页面使用现有的插件授权与协作能力。</p>
      <button className="secondary-button" type="button" disabled={checking || isInstalling} onClick={onInstall}>
        {isInstalling ? "正在获取安装包" : "下载插件"}
      </button>
      {installError ? <p className="profile-card__error" role="alert">{installError}</p> : null}
    </>}
  </section>;
}

function ProfilePage({ profile, extension, onLogout, onReauthorize, onInstall, isBusy, isInstalling, installError }) {
  const user = profile.user ?? {};
  const displayName = user.larkName || "Lark 用户";
  return <div className="profile-content">
    <div className="profile-welcome">
      <div className="profile-avatar" aria-hidden="true">
        {user.larkAvatarUrl ? <img src={user.larkAvatarUrl} alt="" /> : displayName.slice(0, 1)}
      </div>
      <div><p className="eyebrow">个人工作台</p><h1>你好，{displayName}</h1><p className="intro">查看你的 Octo 工作台身份和授权状态。</p></div>
    </div>

    <section className="profile-card profile-card--identity">
      <p className="profile-card__eyebrow">账户信息</p>
      <h2>个人资料</h2>
      <dl className="identity-details">
        <div><dt>姓名</dt><dd>{displayName}</dd></div>
        <div><dt>邮箱</dt><dd>{user.larkEmail || "未提供"}</dd></div>
      </dl>
    </section>

    <div className="authorization-grid">
      <LarkAuthorizationCard authorization={profile.larkAuthorization} onReauthorize={onReauthorize} />
      <MeegleExtensionCard extension={extension} onInstall={onInstall} isInstalling={isInstalling} installError={installError} />
    </div>

    <button className="text-button" type="button" disabled={isBusy} onClick={onLogout}>退出当前工作台</button>
  </div>;
}

function LoginPage({ status, isBusy, onLogin }) {
  return <div className="login-content">
    <p className="eyebrow">项目协作工作台</p>
    <h1 id="login-title">使用 Lark 继续</h1>
    <p className="intro">登录后即可回到你的 Tenways Octo 工作区，继续管理项目、事项和协作流程。</p>

    <section className="auth-card" aria-live="polite">
      <div className="auth-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M12 3v9h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <div><h2>{status.title}</h2><p>{status.text}</p></div>
    </section>

    <button className="primary-button" type="button" disabled={isBusy} onClick={onLogin}>
      <span>使用 Lark 登录</span>
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>

    <div className="security-note">
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.75 16 5v4.25c0 3.4-2.3 6.48-6 7.75-3.7-1.27-6-4.35-6-7.75V5l6-2.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m7.6 9.9 1.55 1.55 3.3-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      <p>登录令牌仅保存在 Octo 服务端；浏览器只持有 HttpOnly 的工作台会话 Cookie。</p>
    </div>
    <p className="help-text">无需安装浏览器扩展，也不会读取 Chrome 或 Meegle 的 Cookie。</p>
  </div>;
}

export function App({ apiBaseUrl }) {
  const [status, setStatus] = useState(initialStatus);
  const [isBusy, setIsBusy] = useState(false);
  const [profile, setProfile] = useState();
  const [extension, setExtension] = useState({ status: "checking" });
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState("");

  const checkSession = useCallback(async () => {
    setIsBusy(true);
    const result = await getWebProfile({ apiBaseUrl });
    setProfile(result.authenticated ? result.profile : undefined);
    setStatus(result.authenticated
      ? { title: "登录成功", text: "正在进入你的 Tenways Octo 工作台。" }
      : { title: "请使用 Lark 登录", text: "通过 Lark 授权后即可进入你的 Tenways Octo 工作台。" });
    setIsBusy(false);
  }, [apiBaseUrl]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!profile) {
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

  const downloadExtension = useCallback(async () => {
    setIsInstalling(true);
    setInstallError("");
    try {
      const { downloadUrl } = await getExtensionDownloadInfo({ apiBaseUrl });
      if (!downloadUrl) {
        setInstallError("当前未配置插件安装包，请联系管理员获取。");
        return;
      }
      window.location.assign(downloadUrl);
    } catch {
      setInstallError("暂时无法获取插件安装包，请稍后重试。");
    } finally {
      setIsInstalling(false);
    }
  }, [apiBaseUrl]);

  return <main className="auth-layout">
    <section className="auth-panel" aria-label="Tenways Octo 工作台">
      <header className="brand-header">
        <a className="brand" href="/" aria-label="Tenways Octo 首页">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
          <span>Tenways Octo</span>
        </a>
        <span className="environment-badge">Workspace</span>
      </header>

      {profile ? <ProfilePage profile={profile} extension={extension} onLogout={() => void logout()} onReauthorize={() => startLarkLogin({ apiBaseUrl })} onInstall={() => void downloadExtension()} isBusy={isBusy} isInstalling={isInstalling} installError={installError} /> : <LoginPage status={status} isBusy={isBusy} onLogin={() => startLarkLogin({ apiBaseUrl })} />}

      <footer className="auth-footer"><span>© Tenways</span><span className="footer-dot" aria-hidden="true">•</span><a href="mailto:tech@tenways.com">需要帮助？</a></footer>
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
