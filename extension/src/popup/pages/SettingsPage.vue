<template>
  <PopupPage
    title="设置"
    subtitle="管理当前插件实例使用的服务地址和身份映射。"
    data-test="settings-page"
  >
    <template #actions>
      <div class="settings-page__header-actions">
        <UiButton data-test="settings-cancel" @click="$emit('cancel')">
          取消
        </UiButton>
        <UiButton
          data-test="settings-refresh-server-config"
          @click="$emit('refreshServerConfig')"
        >
          刷新配置
        </UiButton>
        <UiButton
          variant="primary"
          data-test="settings-save"
          @click="$emit('save')"
        >
          保存
        </UiButton>
      </div>
    </template>
    <div class="settings-page__form">
      <label class="settings-page__field">
        <span class="settings-page__label">Meegle User Key</span>
        <div class="settings-page__inline-field">
          <input
            v-model="form.meegleUserKey"
            class="settings-page__input"
            placeholder="输入 Meegle User Key"
          />
          <UiButton
            data-test="settings-fetch-meegle-user-key"
            @click="$emit('fetchMeegleUserKey')"
          >
            获取
          </UiButton>
        </div>
      </label>
      <label class="settings-page__field">
        <span class="settings-page__label">Lark User ID (可选)</span>
        <input
          :value="larkUserId"
          class="settings-page__input"
          readonly
          data-test="settings-lark-user-id"
          placeholder="等待服务端回填"
        />
      </label>
      <label class="settings-page__field">
        <span class="settings-page__label">Lark Email</span>
        <input
          :value="larkEmail"
          class="settings-page__input"
          readonly
          data-test="settings-lark-email"
          placeholder="等待服务端回填"
        />
      </label>
      <label class="settings-page__field">
        <span class="settings-page__label">Environment</span>
        <select
          v-model="form.ENV_NAME"
          class="settings-page__input"
        >
          <option value="prod">prod</option>
          <option value="test">test</option>
        </select>
      </label>
      <label class="settings-page__field">
        <span class="settings-page__label">Server URL</span>
        <input
          :value="form.SERVER_URL"
          class="settings-page__input"
          readonly
        />
      </label>
      <label class="settings-page__field">
        <span class="settings-page__label">Lark Callback URL</span>
        <input
          :value="form.LARK_OAUTH_CALLBACK_URL"
          class="settings-page__input"
          readonly
          data-test="settings-lark-callback-url"
        />
      </label>
      <label class="settings-page__field">
        <span class="settings-page__label">MEEGLE Plugin ID</span>
        <input
          :value="form.MEEGLE_PLUGIN_ID"
          class="settings-page__input"
          readonly
          data-test="settings-meegle-plugin-id"
          placeholder="由服务端配置提供"
        />
      </label>
    </div>
  </PopupPage>
</template>

<script setup lang="ts">
import PopupPage from "../components/PopupPage.vue";
import UiButton from "../components/UiButton.vue";
import type { PopupSettingsForm } from "../types.js";

defineProps<{
  form: PopupSettingsForm;
  larkUserId: string;
  larkEmail: string;
}>();

defineEmits<{
  cancel: [];
  fetchMeegleUserKey: [];
  refreshServerConfig: [];
  save: [];
}>();
</script>

<style scoped>
.settings-page__form {
  display: grid;
  gap: 12px;
}

.settings-page__field {
  display: grid;
  gap: 6px;
}

.settings-page__label {
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}

.settings-page__inline-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.settings-page__header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.settings-page__input {
  width: 100%;
  min-height: 38px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  color: #0f172a;
  font: inherit;
  padding: 9px 12px;
}

.settings-page__input::placeholder {
  color: #94a3b8;
}

.settings-page__input[readonly] {
  background: #f8fafc;
  color: #475569;
}
</style>
