import { lazy, Suspense } from "react";

import { BulkCreateModalFallback } from "./components/BulkCreateModalFallback.js";
import { PageLoadingFallback } from "./components/PageLoadingFallback.js";
import { PopupShell } from "./components/PopupShell.js";
import { UpdateBanner } from "./components/UpdateBanner.js";
import { VerticalTabBar } from "./components/VerticalTabBar.js";
import { AutomationPage } from "./pages/AutomationPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { UnsupportedPageView } from "./pages/UnsupportedPageView.js";
import type { PopupAppModel } from "./types.js";

const LazyChatPage = lazy(async () => {
  const module = await import("./pages/ChatPage.js");

  return { default: module.ChatPage };
});

const LazyLarkBulkCreateModal = lazy(async () => {
  const module = await import("./components/LarkBulkCreateModal.js");

  return { default: module.LarkBulkCreateModal };
});

export function PopupAppView({ popupApp }: { popupApp: PopupAppModel }) {
  return (
    <div className="app-root">
      <div className="app-layout">
        <div className="app-content">
          <PopupShell>
            {popupApp.update ? (
              <UpdateBanner
                update={popupApp.update}
                onDownload={popupApp.downloadUpdate}
                onIgnore={popupApp.ignoreUpdateVersion}
              />
            ) : null}
            {renderActivePage(popupApp)}
          </PopupShell>
          {popupApp.larkBulkCreateModal.visible ? (
            <Suspense fallback={<BulkCreateModalFallback />}>
              <LazyLarkBulkCreateModal
                visible={popupApp.larkBulkCreateModal.visible}
                stage={popupApp.larkBulkCreateModal.stage}
                preview={popupApp.larkBulkCreateModal.preview}
                result={popupApp.larkBulkCreateModal.result}
                bulkError={popupApp.larkBulkCreateModal.bulkError}
                onConfirm={popupApp.confirmLarkBulkCreate}
                onClose={popupApp.closeLarkBulkCreateModal}
              />
            </Suspense>
          ) : null}
        </div>
        <VerticalTabBar
          value={popupApp.activePage}
          authorized={popupApp.state.isAuthed.lark && popupApp.state.isAuthed.meegle}
          larkAvatar={popupApp.state.identity.larkAvatar || undefined}
          onChange={popupApp.setActivePage}
        />
      </div>
    </div>
  );
}

function renderActivePage(popupApp: PopupAppModel) {
  switch (popupApp.activePage) {
    case "automation":
      return (
        <AutomationPage
          state={popupApp.state}
          viewModel={popupApp.viewModel}
          larkActions={popupApp.larkActions}
          meegleActions={popupApp.meegleActions}
          onFeature={popupApp.runFeatureAction}
        />
      );
    case "chat":
      if (popupApp.viewModel.showUnsupported) {
        return <UnsupportedPageView />;
      }

      return (
        <Suspense
          fallback={<PageLoadingFallback title="聊天" subtitle="正在加载聊天壳层。" />}
        >
          <LazyChatPage
            busy={popupApp.kimiChatBusy}
            sessionId={popupApp.kimiChatSessionId}
            transcript={popupApp.kimiChatTranscript}
            draftMessage={popupApp.kimiChatDraftMessage}
            historyOpen={popupApp.kimiChatHistoryOpen}
            historyLoading={popupApp.kimiChatHistoryLoading}
            historyItems={popupApp.kimiChatHistoryItems}
            onDraftMessageChange={popupApp.updateKimiChatDraftMessage}
            onSendMessage={popupApp.sendKimiChatMessage}
            onResetSession={popupApp.resetKimiChatSession}
            onOpenHistory={popupApp.openKimiChatHistory}
            onCloseHistory={popupApp.closeKimiChatHistory}
            onLoadHistorySession={popupApp.loadKimiChatHistorySession}
            onDeleteHistorySession={popupApp.deleteKimiChatHistorySession}
            onStopGeneration={popupApp.stopKimiChatGeneration}
          />
        </Suspense>
      );
    case "settings":
      return (
        <SettingsPage
          form={popupApp.settingsForm}
          larkUserId={popupApp.state.identity.larkId || ""}
          larkEmail={popupApp.state.identity.larkEmail || ""}
          onCancel={popupApp.closeSettings}
          onFetchMeegleUserKey={popupApp.fetchMeegleUserKey}
          onRefreshServerConfig={popupApp.refreshServerConfig}
          onSave={popupApp.saveSettingsForm}
          onFormFieldChange={popupApp.updateSettingsFormField}
        />
      );
    case "profile":
    default:
      return (
        <ProfilePage
          identity={popupApp.state.identity}
          meegleStatus={popupApp.meegleStatus}
          larkStatus={popupApp.larkStatus}
          topMeegleButtonText={popupApp.topMeegleButtonText}
          topLarkButtonText={popupApp.topLarkButtonText}
          topMeegleButtonDisabled={popupApp.topMeegleButtonDisabled}
          topLarkButtonDisabled={popupApp.topLarkButtonDisabled}
          logs={popupApp.logs}
          onAuthorizeMeegle={popupApp.authorizeMeegle}
          onAuthorizeLark={popupApp.authorizeLark}
          onClearLogs={popupApp.clearLogs}
          onExportLogs={popupApp.exportLogs}
        />
      );
  }
}
