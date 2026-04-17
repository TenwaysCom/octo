<template>
  <div class="chat-page" data-test="chat-page">
    <KimiChatPanel
      v-if="showKimiChat"
      :transcript="kimiChatTranscript"
      :busy="kimiChatBusy"
      :draft-message="kimiChatDraftMessage"
      @send="$emit('sendKimiChatMessage', $event)"
      @stop="$emit('stopKimiChatGeneration')"
      @update:draft-message="$emit('updateKimiChatDraftMessage', $event)"
    />
    <UnsupportedPageView
      v-else-if="viewModel.showUnsupported"
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
import type { KimiChatTranscriptEntry } from "../../types/acp-kimi.js";
import KimiChatPanel from "../components/KimiChatPanel.vue";
import type { PopupViewModel } from "../view-model.js";
import UnsupportedPageView from "./UnsupportedPageView.vue";

defineProps<{
  viewModel: PopupViewModel;
  showKimiChat: boolean;
  kimiChatTranscript: KimiChatTranscriptEntry[];
  kimiChatBusy: boolean;
  kimiChatDraftMessage: string;
}>();

defineEmits<{
  sendKimiChatMessage: [message: string];
  stopKimiChatGeneration: [];
  updateKimiChatDraftMessage: [message: string];
}>();
</script>

<style scoped>
.chat-page {
  display: grid;
  gap: 12px;
}
</style>
