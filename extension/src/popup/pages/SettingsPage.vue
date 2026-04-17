<template>
  <PopupPage
    title="设置"
    subtitle="管理当前插件实例使用的服务地址和身份映射。"
    data-test="settings-page"
  >
    <template #actions>
      <div class="settings-page__header-actions">
        <a-button data-test="settings-cancel" @click="$emit('cancel')">
          取消
        </a-button>
        <a-button
          data-test="settings-refresh-server-config"
          @click="$emit('refreshServerConfig')"
        >
          刷新配置
        </a-button>
        <a-button
          type="primary"
          data-test="settings-save"
          @click="$emit('save')"
        >
          保存
        </a-button>
      </div>
    </template>
    <a-form layout="vertical" class="settings-page__form">
      <a-form-item label="Meegle User Key">
        <div class="settings-page__inline-field">
          <a-input
            v-model:value="form.meegleUserKey"
            placeholder="输入 Meegle User Key"
          />
          <a-button
            data-test="settings-fetch-meegle-user-key"
            @click="$emit('fetchMeegleUserKey')"
          >
            获取
          </a-button>
        </div>
      </a-form-item>
      <a-form-item label="Lark User ID (可选)">
        <a-input
          :value="larkUserId"
          readonly
          data-test="settings-lark-user-id"
          placeholder="等待服务端回填"
        />
      </a-form-item>
      <a-form-item label="Lark Email">
        <a-input
          :value="larkEmail"
          readonly
          data-test="settings-lark-email"
          placeholder="等待服务端回填"
        />
      </a-form-item>
      <a-form-item label="Server URL">
        <a-input
          v-model:value="form.SERVER_URL"
          placeholder="https://octo.odoo.tenways.it:18443"
        />
      </a-form-item>
      <a-form-item label="Lark Callback URL">
        <a-input
          :value="form.LARK_OAUTH_CALLBACK_URL"
          readonly
          data-test="settings-lark-callback-url"
        />
      </a-form-item>
      <a-form-item label="MEEGLE Plugin ID">
        <a-input
          :value="form.MEEGLE_PLUGIN_ID"
          readonly
          data-test="settings-meegle-plugin-id"
          placeholder="由服务端配置提供"
        />
      </a-form-item>
    </a-form>
  </PopupPage>
</template>

<script setup lang="ts">
import PopupPage from "../components/PopupPage.vue";
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
  gap: 4px;
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
</style>
