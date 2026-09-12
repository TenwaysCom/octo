import { Brand } from "../components/layout/WorkspaceShell.jsx";

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

export function SessionLoadingPage() {
  return <main className="session-loading" aria-live="polite" aria-label="正在恢复工作台会话">
    <div className="session-loading__content">
      <Brand />
      <span className="session-loading__indicator" aria-hidden="true" />
      <p>正在恢复工作台会话…</p>
    </div>
  </main>;
}

export function UnauthenticatedPage({ status, isBusy, extension, onLogin, onPluginLogin }) {
  return <main className="auth-layout">
    <section className="auth-panel" aria-label="Tenways Octo 工作台">
      <header className="brand-header">
        <Brand />
        <span className="environment-badge">项目协作工作台</span>
      </header>

      <LoginPage status={status} isBusy={isBusy} extension={extension} onLogin={onLogin} onPluginLogin={onPluginLogin} />

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
