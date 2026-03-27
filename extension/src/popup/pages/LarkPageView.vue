<template>
  <div class="page-view">
    <AuthStatusCard
      v-if="viewModel.showAuthBlockTop"
      title="授权状态"
      :meegle-status="meegleStatus"
      :lark-status="larkStatus"
      :meegle-button-text="topMeegleButtonText"
      :lark-button-text="topLarkButtonText"
      :meegle-button-disabled="topMeegleButtonDisabled"
      :lark-button-disabled="topLarkButtonDisabled"
      @authorize-meegle="$emit('authorizeMeegle')"
      @authorize-lark="$emit('authorizeLark')"
    />
    <FeatureActionsCard
      v-if="viewModel.showLarkFeatureBlock"
      title="Lark 功能"
      :actions="actions"
      @action="$emit('feature', $event)"
    />
    <AuthStatusCard
      v-if="viewModel.showAuthBlockBottom"
      title="授权状态"
      :meegle-status="meegleStatus"
      :lark-status="larkStatus"
      meegle-button-text="重新授权"
      lark-button-text="重新授权"
      secondary-buttons
      @authorize-meegle="$emit('authorizeMeegle')"
      @authorize-lark="$emit('authorizeLark')"
    />
  </div>
</template>

<script setup lang="ts">
import AuthStatusCard from "../components/AuthStatusCard.vue";
import FeatureActionsCard from "../components/FeatureActionsCard.vue";
import type { PopupFeatureAction, PopupStatusChip } from "../types";
import type { PopupViewModel } from "../view-model";

defineProps<{
  viewModel: PopupViewModel;
  meegleStatus: PopupStatusChip;
  larkStatus: PopupStatusChip;
  topMeegleButtonText: string;
  topLarkButtonText: string;
  topMeegleButtonDisabled: boolean;
  topLarkButtonDisabled: boolean;
  actions: PopupFeatureAction[];
}>();

defineEmits<{
  authorizeMeegle: [];
  authorizeLark: [];
  feature: [key: string];
}>();
</script>

<style scoped>
.page-view {
  display: grid;
  gap: 12px;
}
</style>
