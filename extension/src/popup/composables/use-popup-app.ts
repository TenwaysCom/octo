import { computed, getCurrentScope, onScopeDispose, reactive, ref, watch } from "vue";

import {
  createPopupController,
  type PopupIdentityState,
} from "../../popup-shared/popup-controller.js";
import type { PopupSettingsForm } from "../types.js";

function clonePopupAppState(state: ReturnType<
  ReturnType<typeof createPopupController>["getState"]
>["state"]) {
  return cloneValue(state);
}

function cloneSettingsForm(settings: PopupSettingsForm): PopupSettingsForm {
  return {
    ENV_NAME: settings.ENV_NAME,
    SERVER_URL: settings.SERVER_URL,
    MEEGLE_PLUGIN_ID: settings.MEEGLE_PLUGIN_ID,
    LARK_OAUTH_CALLBACK_URL: settings.LARK_OAUTH_CALLBACK_URL,
    meegleUserKey: settings.meegleUserKey,
    larkUserId: settings.larkUserId,
  };
}

function cloneIdentityState(identity: PopupIdentityState): PopupIdentityState {
  return {
    masterUserId: identity.masterUserId,
    larkId: identity.larkId,
    larkEmail: identity.larkEmail,
    larkName: identity.larkName,
    larkAvatar: identity.larkAvatar,
    meegleUserKey: identity.meegleUserKey,
  };
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function syncIntoReactiveObject<T extends Record<string, unknown>>(
  target: T,
  source: T,
): void {
  for (const key of Object.keys(target)) {
    if (!(key in source)) {
      delete target[key as keyof T];
    }
  }

  for (const [key, value] of Object.entries(source)) {
    const currentValue = target[key as keyof T];
    if (
      currentValue &&
      value &&
      typeof currentValue === "object" &&
      typeof value === "object" &&
      !Array.isArray(currentValue) &&
      !Array.isArray(value)
    ) {
      syncIntoReactiveObject(
        currentValue as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      continue;
    }

    target[key as keyof T] =
      value && typeof value === "object"
        ? (cloneValue(value) as T[keyof T])
        : (value as T[keyof T]);
  }
}

export function usePopupApp() {
  const controller = createPopupController();
  const snapshot = ref(controller.getState());
  const activePage = ref(snapshot.value.activePage);
  const state = reactive(clonePopupAppState(snapshot.value.state));
  const settingsForm = reactive(cloneSettingsForm(snapshot.value.settingsForm));
  let syncingIdentityState = false;
  let syncingSettingsForm = false;

  const unsubscribe = controller.subscribe(() => {
    const next = controller.getState();
    snapshot.value = next;
    activePage.value = next.activePage;
    syncingIdentityState = true;
    syncIntoReactiveObject(
      state as unknown as Record<string, unknown>,
      next.state as unknown as Record<string, unknown>,
    );
    syncingIdentityState = false;
    syncingSettingsForm = true;
    syncIntoReactiveObject(
      settingsForm as unknown as Record<string, unknown>,
      cloneSettingsForm(next.settingsForm) as unknown as Record<string, unknown>,
    );
    syncingSettingsForm = false;
  });

  if (getCurrentScope()) {
    onScopeDispose(() => {
      unsubscribe();
      controller.dispose();
    });
  }

  watch(activePage, (nextPage) => {
    if (nextPage !== controller.getState().activePage) {
      controller.setActivePage(nextPage);
    }
  });

  watch(
    () => state.identity,
    (nextIdentity) => {
      if (syncingIdentityState) {
        return;
      }

      controller.syncLegacyIdentityState(cloneIdentityState(nextIdentity));
    },
    { deep: true, flush: "sync" },
  );

  watch(
    settingsForm,
    (nextSettings) => {
      if (syncingSettingsForm) {
        return;
      }

      controller.setSettingsForm(cloneSettingsForm(nextSettings));
    },
    { deep: true, flush: "sync" },
  );

  return {
    state,
    logs: computed(() => snapshot.value.logs),
    isLoading: computed(() => snapshot.value.isLoading),
    activePage,
    settingsOpen: computed(() => snapshot.value.settingsOpen),
    settingsForm,
    viewModel: computed(() => snapshot.value.viewModel),
    headerSubtitle: computed(() => snapshot.value.headerSubtitle),
    meegleStatus: computed(() => snapshot.value.meegleStatus),
    larkStatus: computed(() => snapshot.value.larkStatus),
    topMeegleButtonText: computed(() => snapshot.value.topMeegleButtonText),
    topLarkButtonText: computed(() => snapshot.value.topLarkButtonText),
    topMeegleButtonDisabled: computed(
      () => snapshot.value.topMeegleButtonDisabled,
    ),
    topLarkButtonDisabled: computed(() => snapshot.value.topLarkButtonDisabled),
    larkActions: computed(() => snapshot.value.larkActions),
    meegleActions: computed(() => snapshot.value.meegleActions),
    larkBulkCreateModal: computed(() => snapshot.value.larkBulkCreateModal),
    showKimiChat: computed(() => snapshot.value.showKimiChat),
    kimiChatTranscript: computed(() => snapshot.value.kimiChatTranscript),
    kimiChatBusy: computed(() => snapshot.value.kimiChatBusy),
    kimiChatSessionId: computed(() => snapshot.value.kimiChatSessionId),
    kimiChatDraftMessage: computed(() => snapshot.value.kimiChatDraftMessage),
    kimiChatHistoryOpen: computed(() => snapshot.value.kimiChatHistoryOpen),
    kimiChatHistoryLoading: computed(() => snapshot.value.kimiChatHistoryLoading),
    kimiChatHistoryItems: computed(() => snapshot.value.kimiChatHistoryItems),
    initialize: controller.initialize,
    authorizeMeegle: controller.authorizeMeegle,
    authorizeLark: controller.authorizeLark,
    openSettings: controller.openSettings,
    closeSettings: controller.closeSettings,
    fetchMeegleUserKey: controller.fetchMeegleUserKey,
    saveSettingsForm: controller.saveSettingsForm,
    refreshServerConfig: controller.refreshServerConfig,
    clearLogs: controller.clearLogs,
    exportLogs: controller.exportLogs,
    runFeatureAction: controller.runFeatureAction,
    confirmLarkBulkCreate: controller.confirmLarkBulkCreate,
    closeLarkBulkCreateModal: controller.closeLarkBulkCreateModal,
    resetKimiChatSession: controller.resetKimiChatSession,
    openKimiChatHistory: controller.openKimiChatHistory,
    closeKimiChatHistory: controller.closeKimiChatHistory,
    loadKimiChatHistorySession: controller.loadKimiChatHistorySession,
    deleteKimiChatHistorySession: controller.deleteKimiChatHistorySession,
    updateKimiChatDraftMessage: controller.updateKimiChatDraftMessage,
    sendKimiChatMessage: controller.sendKimiChatMessage,
    stopKimiChatGeneration: controller.stopKimiChatGeneration,
  };
}
