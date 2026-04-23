import { useEffect, useRef, useSyncExternalStore } from "react";

import { createPopupController } from "../../popup-shared/popup-controller.js";

export function usePopupApp() {
  const controllerRef = useRef<ReturnType<typeof createPopupController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createPopupController();
  }

  const controller = controllerRef.current;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  useEffect(() => () => {
    controller.dispose();
  }, [controller]);

  return {
    ...state,
    initialize: controller.initialize,
    authorizeMeegle: controller.authorizeMeegle,
    authorizeLark: controller.authorizeLark,
    setActivePage: controller.setActivePage,
    openSettings: controller.openSettings,
    closeSettings: controller.closeSettings,
    setSettingsForm: controller.setSettingsForm,
    updateSettingsFormField: controller.updateSettingsFormField,
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
    ignoreUpdateVersion: controller.ignoreUpdateVersion,
    downloadUpdate: controller.downloadUpdate,
    lookupGitHubPr: controller.lookupGitHubPr,
  };
}
