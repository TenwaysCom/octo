import { WorkspaceShell } from "../components/layout/WorkspaceShell.jsx";
import { KEYBOARD_SHORTCUTS } from "../lib/keyboard-shortcuts.js";

export function KeyboardShortcutsPage({ profile, onLogout, isBusy, breadcrumbs }) {
  return <WorkspaceShell user={profile.user ?? {}} activePage="shortcuts" onLogout={onLogout} isBusy={isBusy} breadcrumbs={breadcrumbs}>
    <section className="profile-main shortcuts-page">
      <header className="shortcuts-page__header">
        <p className="eyebrow">WORKSPACE</p>
        <h1>快捷键</h1>
        <p>快捷键不会干扰输入；仅关闭类快捷键可在输入框中响应。</p>
      </header>
      <section className="shortcuts-card" aria-label="快捷键说明">
        {KEYBOARD_SHORTCUTS.map((shortcut) => <div className="shortcuts-card__item" key={shortcut.key}>
          <kbd>{shortcut.key}</kbd>
          <div>
            <strong>{shortcut.description}</strong>
            <p>{shortcut.pages.join("、")}</p>
          </div>
        </div>)}
      </section>
    </section>
  </WorkspaceShell>;
}
