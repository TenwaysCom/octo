import { UiBadge } from "../popup-react/components/UiBadge.js";
import { UiButton } from "../popup-react/components/UiButton.js";
import { UiCard } from "../popup-react/components/UiCard.js";
import type { PopupSettingsForm } from "../popup/types.js";
import type { PopupPageType } from "../popup/view-model.js";

type ToolbarEnvironmentName = NonNullable<PopupSettingsForm["ENV_NAME"]>;

export function ToolbarPopupView({
  pageType,
  meegleStatusText,
  larkStatusText,
  meegleAuthorized,
  larkAuthorized,
  environmentName,
  serverUrl,
  onEnvironmentChange,
  onSaveEnvironment,
  onAuthorizeMeegle,
  onAuthorizeLark,
}: {
  pageType: PopupPageType;
  meegleStatusText: string;
  larkStatusText: string;
  meegleAuthorized: boolean;
  larkAuthorized: boolean;
  environmentName: ToolbarEnvironmentName;
  serverUrl: string;
  onEnvironmentChange: (environmentName: ToolbarEnvironmentName) => void;
  onSaveEnvironment: () => void | Promise<void>;
  onAuthorizeMeegle: () => void | Promise<void>;
  onAuthorizeLark: () => void | Promise<void>;
}) {
  const showAuthActions = !meegleAuthorized || !larkAuthorized;

  return (
    <main className="toolbar-popup" data-test="toolbar-popup">
      <UiCard>
        <div className="toolbar-popup__hero">
          <div className="toolbar-popup__hero-copy">
            <p className="toolbar-popup__eyebrow">Tenways Octo</p>
            <h1 className="toolbar-popup__title">请使用页面悬浮 Icon</h1>
            <p className="toolbar-popup__hint">
              {resolveHint(pageType)}
            </p>
          </div>
          <UiBadge tone={pageType === "unsupported" ? "warning" : "processing"}>
            {resolvePageLabel(pageType)}
          </UiBadge>
        </div>
      </UiCard>

      <UiCard title="授权状态">
        <div className="toolbar-popup__status-list">
          <StatusRow
            label="Meegle"
            text={meegleStatusText}
            authorized={meegleAuthorized}
          />
          <StatusRow
            label="Lark"
            text={larkStatusText}
            authorized={larkAuthorized}
          />
        </div>
      </UiCard>

      <UiCard title="环境配置">
        <div className="toolbar-popup__environment">
          <label className="toolbar-popup__environment-field">
            <span className="toolbar-popup__status-label">Environment</span>
            <select
              value={environmentName}
              className="settings-page__input"
              onChange={(event) =>
                onEnvironmentChange(event.target.value as ToolbarEnvironmentName)
              }
            >
              <option value="prod">prod</option>
              <option value="test">test</option>
              <option value="dev">dev</option>
            </select>
          </label>
          <UiButton
            size="sm"
            variant="primary"
            className="toolbar-popup__environment-save"
            onClick={onSaveEnvironment}
          >
            保存
          </UiButton>
        </div>
        <p className="toolbar-popup__server-url">Server URL: {serverUrl}</p>
      </UiCard>

      {showAuthActions ? (
        <UiCard title="授权跳转">
          <div className="toolbar-popup__actions">
            <p className="toolbar-popup__order-tip">
              未授权时，请先授权 Meegle，再授权 Lark。
            </p>
            {!meegleAuthorized ? (
              <UiButton variant="primary" block onClick={onAuthorizeMeegle}>
                授权 Meegle
              </UiButton>
            ) : null}
            {!larkAuthorized ? (
              <UiButton
                variant="default"
                block
                disabled={!meegleAuthorized}
                onClick={onAuthorizeLark}
              >
                授权 Lark
              </UiButton>
            ) : null}
          </div>
        </UiCard>
      ) : null}
    </main>
  );
}

function StatusRow({
  label,
  text,
  authorized,
}: {
  label: string;
  text: string;
  authorized: boolean;
}) {
  return (
    <div className="toolbar-popup__status-row">
      <div className="toolbar-popup__status-copy">
        <span className="toolbar-popup__status-label">{label}</span>
        <span className="toolbar-popup__status-text">{text}</span>
      </div>
      <UiBadge tone={authorized ? "success" : "warning"}>
        {authorized ? "已授权" : "待处理"}
      </UiBadge>
    </div>
  );
}

function resolvePageLabel(pageType: PopupPageType): string {
  if (pageType === "lark") return "Lark 页面";
  if (pageType === "meegle") return "Meegle 页面";
  if (pageType === "github") return "GitHub PR / Issue 页面";
  return "非支持页面";
}

function resolveHint(pageType: PopupPageType): string {
  if (pageType === "unsupported") {
    return "请切换到 Lark、Meegle 或 GitHub PR / Issue 页面，再使用页面悬浮 Icon。";
  }

  return "工具栏入口只负责提示和授权跳转，完整功能请使用页面内的悬浮 Icon。";
}
