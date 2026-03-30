<template>
  <a-card :title="title" size="small" :bordered="true">
    <div class="auth-card__rows">
      <div class="auth-card__row">
        <span class="auth-card__label">Meegle User</span>
        <div class="auth-card__value">
          <a-tag :color="tagColorMap[meegleStatus.tone]">{{ meegleStatus.text }}</a-tag>
          <a-button
            v-if="!meegleButtonDisabled"
            :type="secondaryButtons ? 'default' : 'primary'"
            size="small"
            :disabled="meegleButtonDisabled"
            @click="$emit('authorizeMeegle')"
          >
            {{ meegleButtonText }}
          </a-button>
        </div>
      </div>
      <div class="auth-card__row">
        <span class="auth-card__label">Lark User</span>
        <div class="auth-card__value">
          <a-tag :color="tagColorMap[larkStatus.tone]">{{ larkStatus.text }}</a-tag>
          <a-button
            v-if="!larkButtonDisabled"
            :type="secondaryButtons ? 'default' : 'primary'"
            size="small"
            :disabled="larkButtonDisabled"
            @click="$emit('authorizeLark')"
          >
            {{ larkButtonText }}
          </a-button>
        </div>
      </div>
    </div>
  </a-card>
</template>

<script setup lang="ts">
import type { PopupStatusChip } from "../types";

defineProps<{
  title: string;
  meegleStatus: PopupStatusChip;
  larkStatus: PopupStatusChip;
  meegleButtonText: string;
  larkButtonText: string;
  meegleButtonDisabled?: boolean;
  larkButtonDisabled?: boolean;
  secondaryButtons?: boolean;
}>();

defineEmits<{
  authorizeMeegle: [];
  authorizeLark: [];
}>();

const tagColorMap = {
  success: "success",
  processing: "processing",
  warning: "warning",
  error: "error",
  default: "default",
} as const;
</script>

<style scoped>
.auth-card__rows {
  display: grid;
  gap: 12px;
}

.auth-card__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.auth-card__label {
  color: #334155;
  font-size: 13px;
  font-weight: 500;
}

.auth-card__value {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.auth-card__value :deep(.ant-tag) {
  max-width: 152px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
