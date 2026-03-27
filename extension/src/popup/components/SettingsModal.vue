<template>
  <AModal
    :open="open"
    title="设置"
    ok-text="保存"
    cancel-text="取消"
    @cancel="$emit('close')"
    @ok="$emit('save')"
  >
    <AForm layout="vertical">
      <AFormItem label="Server URL">
        <AInput v-model:value="form.SERVER_URL" placeholder="http://localhost:3000" />
      </AFormItem>
      <AFormItem label="MEEGLE Plugin ID">
        <AInput
          v-model:value="form.MEEGLE_PLUGIN_ID"
          placeholder="输入 MII_ 开头的 Plugin ID"
        />
      </AFormItem>
      <AFormItem label="Meegle User Key">
        <AInput
          v-model:value="form.meegleUserKey"
          placeholder="输入 Meegle User Key"
        />
      </AFormItem>
      <AFormItem label="Lark User ID (可选)">
        <AInput
          v-model:value="form.larkUserId"
          placeholder="输入 Lark User ID"
        />
      </AFormItem>
    </AForm>
  </AModal>
</template>

<script setup lang="ts">
import { Form as AForm, Input as AInput, Modal as AModal } from "ant-design-vue";
import type { PopupSettingsForm } from "../types";

const AFormItem = AForm.Item;

defineProps<{
  open: boolean;
  form: PopupSettingsForm;
}>();

defineEmits<{
  close: [];
  save: [];
}>();
</script>
