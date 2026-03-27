<template>
  <PopupPage
    title="设置"
    subtitle="管理当前插件实例使用的服务地址和身份映射。"
    data-test="settings-page"
  >
    <a-form layout="vertical" class="settings-page__form">
      <a-form-item label="Server URL">
        <a-input
          v-model:value="form.SERVER_URL"
          placeholder="http://localhost:3000"
        />
      </a-form-item>
      <a-form-item label="MEEGLE Plugin ID">
        <a-input
          v-model:value="form.MEEGLE_PLUGIN_ID"
          placeholder="输入 MII_ 开头的 Plugin ID"
        />
      </a-form-item>
      <a-form-item label="Meegle User Key">
        <a-input
          v-model:value="form.meegleUserKey"
          placeholder="输入 Meegle User Key"
        />
      </a-form-item>
      <a-form-item label="Lark User ID (可选)">
        <a-input
          v-model:value="form.larkUserId"
          placeholder="输入 Lark User ID"
        />
      </a-form-item>
      <div class="settings-page__actions">
        <a-button data-test="settings-cancel" @click="$emit('cancel')">
          取消
        </a-button>
        <a-button
          type="primary"
          data-test="settings-save"
          @click="$emit('save')"
        >
          保存
        </a-button>
      </div>
    </a-form>
  </PopupPage>
</template>

<script setup lang="ts">
import PopupPage from "../components/PopupPage.vue";
import type { PopupSettingsForm } from "../types.js";

defineProps<{
  form: PopupSettingsForm;
}>();

defineEmits<{
  cancel: [];
  save: [];
}>();
</script>

<style scoped>
.settings-page__form {
  display: grid;
  gap: 4px;
}

.settings-page__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 8px;
}
</style>
