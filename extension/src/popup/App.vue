<template>
  <a-config-provider :theme="themeConfig">
    <a-app>
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
              :kimi-chat-transcript="kimiChatTranscript"
              :kimi-chat-busy="kimiChatBusy"
              :kimi-chat-draft-message="kimiChatDraftMessage"
              :view-model="viewModel"
              @send-kimi-chat-message="sendKimiChatMessage"
              @stop-kimi-chat-generation="stopKimiChatGeneration"
              @update-kimi-chat-draft-message="updateKimiChatDraftMessage"
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
        </div>
        <VerticalTabBar
          v-model="activePage"
          :authorized="state.isAuthed.lark && state.isAuthed.meegle"
          :lark-avatar="state.identity.larkAvatar || undefined"
        />
      </div>
    </a-app>
  </a-config-provider>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import VerticalTabBar from "./components/VerticalTabBar.vue";
import PopupShell from "./components/PopupShell.vue";
import { usePopupApp } from "./composables/use-popup-app";
import ChatPage from "./pages/ChatPage.vue";
import AutomationPage from "./pages/AutomationPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";
import ProfilePage from "./pages/ProfilePage.vue";

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
  showKimiChat,
  kimiChatTranscript,
  kimiChatBusy,
  kimiChatDraftMessage,
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
  updateKimiChatDraftMessage,
  sendKimiChatMessage,
  stopKimiChatGeneration,
} = usePopupApp();

const themeConfig = {
  token: {
    colorPrimary: "#2563eb",
    borderRadius: 18,
    colorBgBase: "#f8fbff",
    colorTextBase: "#0f172a",
  },
};

onMounted(() => {
  void initialize();
});
</script>

<style scoped>
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
