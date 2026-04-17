<template>
  <div class="automation-page" data-test="automation-page">
    <UnsupportedPageView
      v-if="viewModel.showUnsupported"
      data-test="unsupported-view"
    />
    <template v-else-if="state.pageType === 'lark'">
      <FeatureActionsCard
        title="Lark 功能"
        :actions="larkActions"
        @action="$emit('feature', $event)"
      />
    </template>
    <template v-else-if="state.pageType === 'meegle'">
      <FeatureActionsCard
        title="Meegle 功能"
        :actions="meegleActions"
        @action="$emit('feature', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PopupFeatureAction } from "../types.js";
import type { PopupViewModel } from "../view-model.js";
import FeatureActionsCard from "../components/FeatureActionsCard.vue";
import UnsupportedPageView from "./UnsupportedPageView.vue";

defineProps<{
  state: { pageType: string };
  viewModel: PopupViewModel;
  larkActions: PopupFeatureAction[];
  meegleActions: PopupFeatureAction[];
}>();

defineEmits<{
  feature: [key: string];
}>();
</script>

<style scoped>
.automation-page {
  display: grid;
  gap: 12px;
}
</style>
