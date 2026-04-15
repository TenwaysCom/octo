<template>
  <div class="chat-page" data-test="chat-page">
    <UnsupportedPageView
      v-if="viewModel.showUnsupported"
      data-test="unsupported-view"
    />
    <template v-else>
      <div class="chat-placeholder">
        <a-empty description="聊天功能开发中" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PopupViewModel } from "../view-model.js";
import UnsupportedPageView from "./UnsupportedPageView.vue";

defineProps<{
  viewModel: PopupViewModel;
}>();
</script>

<style scoped>
.chat-page {
  display: grid;
  gap: 12px;
}
</style>
