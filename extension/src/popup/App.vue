<template>
  <a-config-provider :theme="themeConfig">
    <a-app>
      <PopupShell :subtitle="headerSubtitle">
        <PopupNotebook v-model="activePage" />
        <HomePage
          v-if="activePage === 'home'"
          :state="state"
          :logs="logs"
          :view-model="viewModel"
          :meegle-status="meegleStatus"
          :lark-status="larkStatus"
          :top-meegle-button-text="topMeegleButtonText"
          :top-lark-button-text="topLarkButtonText"
          :top-meegle-button-disabled="topMeegleButtonDisabled"
          :top-lark-button-disabled="topLarkButtonDisabled"
          :lark-actions="larkActions"
          :meegle-actions="meegleActions"
          @authorize-meegle="authorizeMeegle"
          @authorize-lark="authorizeLark"
          @feature="runFeatureAction"
          @clear-logs="clearLogs"
        />
        <SettingsPage
          v-else
          :form="settingsForm"
          @cancel="closeSettings"
          @fetch-meegle-user-key="fetchMeegleUserKey"
          @save="saveSettingsForm"
        />
      </PopupShell>
    </a-app>
  </a-config-provider>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import PopupNotebook from "./components/PopupNotebook.vue";
import PopupShell from "./components/PopupShell.vue";
import { usePopupApp } from "./composables/use-popup-app";
import HomePage from "./pages/HomePage.vue";
import SettingsPage from "./pages/SettingsPage.vue";

const {
  state,
  logs,
  activePage,
  settingsForm,
  viewModel,
  headerSubtitle,
  meegleStatus,
  larkStatus,
  topMeegleButtonText,
  topLarkButtonText,
  topMeegleButtonDisabled,
  topLarkButtonDisabled,
  larkActions,
  meegleActions,
  initialize,
  authorizeMeegle,
  authorizeLark,
  closeSettings,
  fetchMeegleUserKey,
  saveSettingsForm,
  clearLogs,
  runFeatureAction,
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
