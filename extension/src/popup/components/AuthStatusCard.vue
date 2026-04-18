<template>
  <UiCard :title="title">
    <div class="auth-card__rows">
      <div class="auth-card__row">
        <span class="auth-card__label">Meegle User</span>
        <div class="auth-card__value">
          <UiBadge :tone="meegleStatus.tone">{{ meegleStatus.text }}</UiBadge>
          <UiButton
            v-if="!meegleButtonDisabled"
            :variant="secondaryButtons ? 'default' : 'primary'"
            size="sm"
            :disabled="meegleButtonDisabled"
            @click="$emit('authorizeMeegle')"
          >
            {{ meegleButtonText }}
          </UiButton>
        </div>
      </div>
      <div class="auth-card__row">
        <span class="auth-card__label">Lark User</span>
        <div class="auth-card__value">
          <UiBadge :tone="larkStatus.tone">{{ larkStatus.text }}</UiBadge>
          <UiButton
            :variant="secondaryButtons ? 'default' : 'primary'"
            size="sm"
            :disabled="larkButtonDisabled"
            @click="$emit('authorizeLark')"
          >
            {{ larkButtonText }}
          </UiButton>
        </div>
      </div>
    </div>
  </UiCard>
</template>

<script setup lang="ts">
import type { PopupStatusChip } from "../types.js";
import UiBadge from "./UiBadge.vue";
import UiButton from "./UiButton.vue";
import UiCard from "./UiCard.vue";

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
  justify-content: flex-end;
}

.auth-card__value :deep(.ui-badge) {
  max-width: 152px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
