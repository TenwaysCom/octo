<template>
  <div class="app-root">
    <div class="app-layout">
      <div class="app-content">
        <PopupShell>
          <AutomationPage
            v-if="activePage === 'automation'"
            :state="state"
            :view-model="viewModel"
            :lark-actions="larkActions"
            :meegle-actions="meegleActions"
            @feature="runFeatureAction"
          />
          <ChatPage
            v-else-if="activePage === 'chat'"
            :show-kimi-chat="showKimiChat"
            :kimi-chat-session-id="kimiChatSessionId"
            :kimi-chat-transcript="kimiChatTranscript"
            :kimi-chat-busy="kimiChatBusy"
            :kimi-chat-draft-message="kimiChatDraftMessage"
            :kimi-chat-history-open="kimiChatHistoryOpen"
            :kimi-chat-history-loading="kimiChatHistoryLoading"
            :kimi-chat-history-items="kimiChatHistoryItems"
            :view-model="viewModel"
            @send-kimi-chat-message="sendKimiChatMessage"
            @stop-kimi-chat-generation="stopKimiChatGeneration"
            @update-kimi-chat-draft-message="updateKimiChatDraftMessage"
            @reset-kimi-chat-session="resetKimiChatSession"
            @open-kimi-chat-history="openKimiChatHistory"
            @close-kimi-chat-history="closeKimiChatHistory"
            @load-kimi-chat-history-session="loadKimiChatHistorySession"
            @delete-kimi-chat-history-session="deleteKimiChatHistorySession"
          />
          <SettingsPage
            v-else-if="activePage === 'settings'"
            :form="settingsForm"
            :lark-user-id="state.identity.larkId || ''"
            :lark-email="state.identity.larkEmail || ''"
            @cancel="closeSettings"
            @fetch-meegle-user-key="fetchMeegleUserKey"
            @refresh-server-config="refreshServerConfig"
            @save="saveSettingsForm"
          />
          <ProfilePage
            v-else
            :identity="state.identity"
            :meegle-status="meegleStatus"
            :lark-status="larkStatus"
            :top-meegle-button-text="topMeegleButtonText"
            :top-lark-button-text="topLarkButtonText"
            :top-meegle-button-disabled="topMeegleButtonDisabled"
            :top-lark-button-disabled="topLarkButtonDisabled"
            :logs="logs"
            @authorize-meegle="authorizeMeegle"
            @authorize-lark="authorizeLark"
            @clear-logs="clearLogs"
            @export-logs="exportLogs"
          />
        </PopupShell>
        <LarkBulkCreateModal
          :visible="larkBulkCreateModal.visible"
          :stage="larkBulkCreateModal.stage"
          :preview="larkBulkCreateModal.preview"
          :result="larkBulkCreateModal.result"
          @confirm="confirmLarkBulkCreate"
          @close="closeLarkBulkCreateModal"
        />
      </div>
      <VerticalTabBar
        v-model="activePage"
        :authorized="state.isAuthed.lark && state.isAuthed.meegle"
        :lark-avatar="state.identity.larkAvatar || undefined"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted } from "vue";
import VerticalTabBar from "./components/VerticalTabBar.vue";
import PopupShell from "./components/PopupShell.vue";
import { usePopupApp } from "./composables/use-popup-app";

const ChatPage = defineAsyncComponent(() => import("./pages/ChatPage.vue"));
const AutomationPage = defineAsyncComponent(() => import("./pages/AutomationPage.vue"));
const SettingsPage = defineAsyncComponent(() => import("./pages/SettingsPage.vue"));
const ProfilePage = defineAsyncComponent(() => import("./pages/ProfilePage.vue"));
const LarkBulkCreateModal = defineAsyncComponent(
  () => import("./components/LarkBulkCreateModal.vue"),
);

const {
  state,
  logs,
  activePage,
  settingsForm,
  viewModel,
  meegleStatus,
  larkStatus,
  topMeegleButtonText,
  topLarkButtonText,
  topMeegleButtonDisabled,
  topLarkButtonDisabled,
  larkActions,
  meegleActions,
  larkBulkCreateModal,
  showKimiChat,
  kimiChatTranscript,
  kimiChatBusy,
  kimiChatSessionId,
  kimiChatDraftMessage,
  kimiChatHistoryOpen,
  kimiChatHistoryLoading,
  kimiChatHistoryItems,
  initialize,
  authorizeMeegle,
  authorizeLark,
  closeSettings,
  fetchMeegleUserKey,
  saveSettingsForm,
  refreshServerConfig,
  clearLogs,
  exportLogs,
  runFeatureAction,
  confirmLarkBulkCreate,
  closeLarkBulkCreateModal,
  resetKimiChatSession,
  openKimiChatHistory,
  closeKimiChatHistory,
  loadKimiChatHistorySession,
  deleteKimiChatHistorySession,
  updateKimiChatDraftMessage,
  sendKimiChatMessage,
  stopKimiChatGeneration,
} = usePopupApp();

onMounted(() => {
  void initialize();
});
</script>

<style scoped>
.app-root {
  min-height: 100vh;
}

.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.app-content {
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
  padding: 12px;
}
</style>
