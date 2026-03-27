<template>
  <a-modal
    :open="open"
    title="设置"
    ok-text="保存"
    cancel-text="取消"
    @cancel="$emit('close')"
    @ok="$emit('save')"
  >
    <a-form layout="vertical">
      <a-form-item label="Server URL">
        <a-input v-model:value="form.SERVER_URL" placeholder="http://localhost:3000" />
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
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import type { PopupSettingsForm } from "../types";

defineProps<{
  open: boolean;
  form: PopupSettingsForm;
}>();

defineEmits<{
  close: [];
  save: [];
}>();
</script>
