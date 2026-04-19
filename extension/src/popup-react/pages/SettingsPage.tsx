import type { ChangeEvent } from "react";

import type { PopupSettingsForm } from "../../popup/types.js";
import { PopupPage } from "../components/PopupPage.js";
import { UiButton } from "../components/UiButton.js";

export function SettingsPage({
  form,
  larkUserId,
  larkEmail,
  onCancel,
  onFetchMeegleUserKey,
  onRefreshServerConfig,
  onSave,
  onFormFieldChange,
}: {
  form: PopupSettingsForm;
  larkUserId: string;
  larkEmail: string;
  onCancel: () => void;
  onFetchMeegleUserKey: () => void | Promise<void>;
  onRefreshServerConfig: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onFormFieldChange: <TKey extends keyof PopupSettingsForm>(
    key: TKey,
    value: PopupSettingsForm[TKey],
  ) => void;
}) {
  return (
    <PopupPage
      title="设置"
      subtitle="管理当前插件实例使用的服务地址和身份映射。"
      actions={(
        <div className="settings-page__header-actions">
          <UiButton data-test="settings-cancel" onClick={onCancel}>
            取消
          </UiButton>
          <UiButton
            data-test="settings-refresh-server-config"
            onClick={onRefreshServerConfig}
          >
            刷新配置
          </UiButton>
          <UiButton variant="primary" data-test="settings-save" onClick={onSave}>
            保存
          </UiButton>
        </div>
      )}
    >
      <div className="settings-page__form" data-test="settings-page">
        <label className="settings-page__field">
          <span className="settings-page__label">Meegle User Key</span>
          <div className="settings-page__inline-field">
            <input
              value={form.meegleUserKey}
              className="settings-page__input"
              placeholder="输入 Meegle User Key"
              onChange={handleFieldChange("meegleUserKey", onFormFieldChange)}
            />
            <UiButton
              data-test="settings-fetch-meegle-user-key"
              onClick={onFetchMeegleUserKey}
            >
              获取
            </UiButton>
          </div>
        </label>
        <label className="settings-page__field">
          <span className="settings-page__label">Lark User ID (可选)</span>
          <input
            value={larkUserId}
            className="settings-page__input"
            readOnly
            data-test="settings-lark-user-id"
            placeholder="等待服务端回填"
          />
        </label>
        <label className="settings-page__field">
          <span className="settings-page__label">Lark Email</span>
          <input
            value={larkEmail}
            className="settings-page__input"
            readOnly
            data-test="settings-lark-email"
            placeholder="等待服务端回填"
          />
        </label>
        <label className="settings-page__field">
          <span className="settings-page__label">Server URL</span>
          <input
            value={form.SERVER_URL}
            className="settings-page__input"
            placeholder="https://octo.odoo.tenways.it:18443"
            onChange={handleFieldChange("SERVER_URL", onFormFieldChange)}
          />
        </label>
        <label className="settings-page__field">
          <span className="settings-page__label">Lark Callback URL</span>
          <input
            value={form.LARK_OAUTH_CALLBACK_URL}
            className="settings-page__input"
            readOnly
            data-test="settings-lark-callback-url"
          />
        </label>
        <label className="settings-page__field">
          <span className="settings-page__label">MEEGLE Plugin ID</span>
          <input
            value={form.MEEGLE_PLUGIN_ID}
            className="settings-page__input"
            readOnly
            data-test="settings-meegle-plugin-id"
            placeholder="由服务端配置提供"
          />
        </label>
      </div>
    </PopupPage>
  );
}

function handleFieldChange<TKey extends keyof PopupSettingsForm>(
  key: TKey,
  onFormFieldChange: (key: TKey, value: PopupSettingsForm[TKey]) => void,
) {
  return (event: ChangeEvent<HTMLInputElement>) => {
    onFormFieldChange(key, event.target.value as PopupSettingsForm[TKey]);
  };
}
