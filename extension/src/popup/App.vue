<template>
  <a-config-provider :theme="themeConfig">
    <a-app>
      <PopupShell :subtitle="headerSubtitle" @settings="openSettings">
        <UnsupportedPageView
          v-if="viewModel.showUnsupported"
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
          @authorize-meegle="authorizeMeegle"
          @authorize-lark="authorizeLark"
          @feature="runFeatureAction"
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
          @authorize-meegle="authorizeMeegle"
          @authorize-lark="authorizeLark"
          @feature="runFeatureAction"
        />
        <LogPanel :entries="logs" @clear="clearLogs" />
      </PopupShell>
      <SettingsModal
        v-if="settingsOpen"
        :open="settingsOpen"
        :form="settingsForm"
        @close="closeSettings"
        @save="saveSettingsForm"
      />
    </a-app>
  </a-config-provider>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted } from "vue";
import LogPanel from "./components/LogPanel.vue";
import PopupShell from "./components/PopupShell.vue";
import { usePopupApp } from "./composables/use-popup-app";
import LarkPageView from "./pages/LarkPageView.vue";
import MeeglePageView from "./pages/MeeglePageView.vue";
import UnsupportedPageView from "./pages/UnsupportedPageView.vue";

const SettingsModal = defineAsyncComponent(
  () => import("./components/SettingsModal.vue"),
);

const {
  state,
  logs,
  settingsOpen,
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
  openSettings,
  closeSettings,
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
