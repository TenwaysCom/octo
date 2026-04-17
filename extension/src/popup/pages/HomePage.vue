<template>
  <div class="home-page" data-test="home-page">
    <AcpChatPanel
      v-if="showKimiChat"
      :transcript="kimiChatTranscript"
      :busy="kimiChatBusy"
      :draft-message="kimiChatDraftMessage"
      @send="$emit('sendKimiChatMessage', $event)"
      @stop="$emit('stopKimiChatGeneration')"
      @update:draft-message="$emit('updateKimiChatDraftMessage', $event)"
    />
    <UnsupportedPageView
      v-if="viewModel.showUnsupported"
      data-test="unsupported-view"
    />
    <LarkPageView
      v-else-if="state.pageType === 'lark'"
      :view-model="viewModel"
      :meegle-status="meegleStatus"
      :lark-status="larkStatus"
      :top-meegle-button-text="topMeegleButtonText"
      :top-lark-button-text="topLarkButtonText"
      :top-meegle-button-disabled="topMeegleButtonDisabled"
      :top-lark-button-disabled="topLarkButtonDisabled"
      :actions="larkActions"
      @authorize-meegle="$emit('authorizeMeegle')"
      @authorize-lark="$emit('authorizeLark')"
      @feature="$emit('feature', $event)"
    />
    <MeeglePageView
      v-else
      :view-model="viewModel"
      :meegle-status="meegleStatus"
      :lark-status="larkStatus"
      :top-meegle-button-text="topMeegleButtonText"
      :top-lark-button-text="topLarkButtonText"
      :top-meegle-button-disabled="topMeegleButtonDisabled"
      :top-lark-button-disabled="topLarkButtonDisabled"
      :actions="meegleActions"
      @authorize-meegle="$emit('authorizeMeegle')"
      @authorize-lark="$emit('authorizeLark')"
      @feature="$emit('feature', $event)"
    />
    <LogPanel :entries="logs" @clear="$emit('clearLogs')" />
  </div>
</template>

<script setup lang="ts">
import type { PopupLogEntry, PopupFeatureAction, PopupStatusChip } from "../types.js";
import type { PopupViewModel } from "../view-model.js";
import type { KimiChatTranscriptEntry } from "../../types/acp-kimi.js";
import AcpChatPanel from "../components/AcpChatPanel.vue";
import LogPanel from "../components/LogPanel.vue";
import LarkPageView from "./LarkPageView.vue";
import MeeglePageView from "./MeeglePageView.vue";
import UnsupportedPageView from "./UnsupportedPageView.vue";

defineProps<{
  state: {
    pageType: string;
  };
  logs: PopupLogEntry[];
  viewModel: PopupViewModel;
  meegleStatus: PopupStatusChip;
  larkStatus: PopupStatusChip;
  topMeegleButtonText: string;
  topLarkButtonText: string;
  topMeegleButtonDisabled: boolean;
  topLarkButtonDisabled: boolean;
  larkActions: PopupFeatureAction[];
  meegleActions: PopupFeatureAction[];
  showKimiChat: boolean;
  kimiChatTranscript: KimiChatTranscriptEntry[];
  kimiChatBusy: boolean;
  kimiChatDraftMessage: string;
}>();

defineEmits<{
  authorizeMeegle: [];
  authorizeLark: [];
  feature: [key: string];
  sendKimiChatMessage: [message: string];
  stopKimiChatGeneration: [];
  updateKimiChatDraftMessage: [message: string];
  clearLogs: [];
}>();
</script>

<style scoped>
.home-page {
  display: grid;
  gap: 12px;
}
</style>
