// @vitest-environment jsdom

import React, { useMemo, useState, type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PopupNotebookPage, PopupSettingsForm } from "../popup/types.js";
import type { PopupAppModel } from "./types.js";
import { PopupAppView } from "./PopupAppView.js";

const lazyModuleState = vi.hoisted(() => ({
  chatGate: null as ReturnType<typeof createDeferred<void>> | null,
  modalGate: null as ReturnType<typeof createDeferred<void>> | null,
  useChatMock: false,
  useModalMock: false,
}));

vi.mock("./pages/ChatPage.js", async (importOriginal) => {
  if (!lazyModuleState.useChatMock) {
    return importOriginal();
  }

  if (lazyModuleState.chatGate) {
    await lazyModuleState.chatGate.promise;
  }

  return {
    ChatPage: () =>
      React.createElement("div", { "data-test": "chat-page" }, "聊天页面占位"),
  };
});

vi.mock("./components/LarkBulkCreateModal.js", async (importOriginal) => {
  if (!lazyModuleState.useModalMock) {
    return importOriginal();
  }

  if (lazyModuleState.modalGate) {
    await lazyModuleState.modalGate.promise;
  }

  return {
    LarkBulkCreateModal: () =>
      React.createElement(
        "div",
        { "data-test": "lark-bulk-create-modal" },
        "批量创建 MEEGLE TICKET",
      ),
  };
});

describe("popup-react lazy boundaries", () => {
  beforeEach(() => {
    lazyModuleState.chatGate = null;
    lazyModuleState.modalGate = null;
    lazyModuleState.useChatMock = false;
    lazyModuleState.useModalMock = false;
  });

  afterEach(() => {
    lazyModuleState.chatGate = null;
    lazyModuleState.modalGate = null;
    lazyModuleState.useChatMock = false;
    lazyModuleState.useModalMock = false;
  });

  it("shows the chat fallback before the lazy chat page resolves", async () => {
    const gate = createDeferred<void>();
    lazyModuleState.useChatMock = true;
    lazyModuleState.chatGate = gate;
    const { container } = renderPopupApp(React.createElement(PopupAppView), {
      initialPage: "chat",
    });

    expect(container.querySelector('[data-test="lazy-page-fallback"]')).not.toBeNull();
    expect(container.querySelector('[data-test="chat-page"]')).toBeNull();

    await act(async () => {
      gate.resolve();
      await gate.promise;
    });

    expect(await screen.findByText("聊天页面占位")).toBeTruthy();
    expect(container.querySelector('[data-test="lazy-page-fallback"]')).toBeNull();
    expect(container.querySelector('[data-test="chat-page"]')).not.toBeNull();
  });

  it("shows the bulk-create modal fallback before the lazy modal resolves", async () => {
    const gate = createDeferred<void>();
    lazyModuleState.useModalMock = true;
    lazyModuleState.modalGate = gate;
    const { container } = renderPopupApp(React.createElement(PopupAppView), {
      bulkModalVisible: true,
      bulkModalStage: "preview",
    });

    expect(container.querySelector('[data-test="lark-bulk-create-modal-loading"]')).not.toBeNull();
    expect(container.querySelector('[data-test="lark-bulk-create-modal"]')).toBeNull();

    await act(async () => {
      gate.resolve();
      await gate.promise;
    });

    expect(await screen.findByText("批量创建 MEEGLE TICKET")).toBeTruthy();
    expect(container.querySelector('[data-test="lark-bulk-create-modal-loading"]')).toBeNull();
    expect(container.querySelector('[data-test="lark-bulk-create-modal"]')).not.toBeNull();
  });
});

function renderPopupApp(
  child: ReactNode,
  options: {
    bulkModalVisible?: boolean;
    bulkModalStage?: "hidden" | "preview" | "executing" | "result";
    initialPage?: PopupNotebookPage;
    pageType?: "lark" | "meegle" | "unsupported";
    showUnsupported?: boolean;
  } = {},
) {
  return render(
    React.createElement(function PopupAppHarness() {
      const [activePage, setActivePage] = useState<PopupNotebookPage>(
        options.initialPage ?? "automation",
      );
      const [settingsForm, setSettingsForm] = useState<PopupSettingsForm>({
        SERVER_URL: "http://localhost:3000",
        MEEGLE_PLUGIN_ID: "MII_PLUGIN",
        LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
        meegleUserKey: "7538275242901291040",
        larkUserId: "ou_test_user",
      });
      const [bulkModal, setBulkModal] = useState({
        visible: options.bulkModalVisible ?? false,
        stage: options.bulkModalStage ?? "hidden",
        preview:
          options.bulkModalVisible && options.bulkModalStage === "preview"
            ? {
                ok: true as const,
                baseId: "base_123",
                tableId: "table_123",
                viewId: "view_123",
                totalRecordsInView: 2,
                eligibleRecords: [
                  {
                    recordId: "rec_1",
                    issueNumber: "N-1",
                    issueType: "User Story",
                    title: "Record one",
                    priority: "P0",
                  },
                ],
                skippedRecords: [],
              }
            : null,
        result: null,
        bulkError: null,
      });

      const popupApp = useMemo<PopupAppModel>(
        () => ({
          state: {
            pageType: options.pageType ?? "lark",
            currentTabId: 12,
            currentTabOrigin: "https://project.larksuite.com",
            currentUrl:
              "https://project.larksuite.com/base/base_123?table=table_123&view=view_123",
            identity: {
              masterUserId: "usr_resolved",
              larkId: "ou_test_user",
              larkEmail: "user@example.com",
              larkName: "Test User",
              larkAvatar: "https://example.com/avatar.png",
              meegleUserKey: "7538275242901291040",
            },
            isAuthed: {
              lark: true,
              meegle: true,
            },
            meegleAuth: undefined,
            larkAuth: undefined,
          },
          logs: [],
          isLoading: false,
          activePage,
          settingsOpen: activePage === "settings",
          settingsForm,
          viewModel: {
            subtitle: options.pageType === "unsupported" ? "不支持" : "Lark",
            showUnsupported: options.showUnsupported ?? options.pageType === "unsupported",
            showAuthBlockTop: !(options.showUnsupported ?? options.pageType === "unsupported"),
            showLarkFeatureBlock: (options.pageType ?? "lark") === "lark",
            showMeegleFeatureBlock: (options.pageType ?? "lark") === "meegle",
            canAnalyze: (options.pageType ?? "lark") === "lark",
            canDraft: (options.pageType ?? "lark") === "lark",
            canApply: (options.pageType ?? "lark") === "lark",
          },
          headerSubtitle: "Lark",
          meegleStatus: { tone: "success", text: "已授权" },
          larkStatus: { tone: "success", text: "已授权" },
          topMeegleButtonText: "已授权",
          topLarkButtonText: "重新授权",
          topMeegleButtonDisabled: true,
          topLarkButtonDisabled: false,
          larkActions: [
            {
              key: "analyze",
              label: "分析当前页面",
              type: "primary",
              disabled: false,
            },
            {
              key: "draft",
              label: "生成草稿",
              disabled: false,
            },
            {
              key: "apply",
              label: "确认创建",
              disabled: false,
            },
          ],
          meegleActions: [
            {
              key: "update-lark-and-push",
              label: "更新Lark及推送",
              type: "primary",
              disabled: false,
            },
          ],
          githubActions: [
            {
              key: "lookup-github-pr",
              label: "查询 PR 关联的 Meegle 工作项",
              type: "primary",
              disabled: false,
            },
          ],
          larkBulkCreateModal: bulkModal,
          showKimiChat: false,
          kimiChatTranscript: [],
          kimiChatBusy: false,
          kimiChatSessionId: null,
          kimiChatDraftMessage: "",
          kimiChatHistoryOpen: false,
          kimiChatHistoryLoading: false,
          kimiChatHistoryItems: [],
          update: null,
          githubLookup: {
            isLoading: false,
            error: null,
            result: null,
          },
          initialize: vi.fn().mockResolvedValue(undefined),
          authorizeMeegle: vi.fn(),
          authorizeLark: vi.fn(),
          setActivePage,
          openSettings: vi.fn(() => {
            setActivePage("settings");
          }),
          closeSettings: vi.fn(() => {
            setActivePage("chat");
          }),
          setSettingsForm,
          updateSettingsFormField: vi.fn((key, value) => {
            setSettingsForm((previous) => ({
              ...previous,
              [key]: value,
            }));
          }),
          fetchMeegleUserKey: vi.fn(),
          saveSettingsForm: vi.fn(async () => undefined),
          refreshServerConfig: vi.fn(async () => undefined),
          clearLogs: vi.fn(),
          exportLogs: vi.fn(),
          runFeatureAction: vi.fn(),
          confirmLarkBulkCreate: vi.fn(async () => undefined),
          closeLarkBulkCreateModal: vi.fn(() => {
            setBulkModal((previous) => ({
              ...previous,
              visible: false,
              stage: "hidden",
              bulkError: null,
            }));
          }),
          resetKimiChatSession: vi.fn(),
          openKimiChatHistory: vi.fn(),
          closeKimiChatHistory: vi.fn(),
          loadKimiChatHistorySession: vi.fn(),
          deleteKimiChatHistorySession: vi.fn(),
          updateKimiChatDraftMessage: vi.fn(),
          sendKimiChatMessage: vi.fn(async () => undefined),
          stopKimiChatGeneration: vi.fn(),
          ignoreUpdateVersion: vi.fn(),
          downloadUpdate: vi.fn(),
          lookupGitHubPr: vi.fn(),
        }),
        [activePage, bulkModal, options.pageType, options.showUnsupported, settingsForm],
      );

      return React.cloneElement(child as React.ReactElement<{ popupApp: PopupAppModel }>, {
        popupApp,
      });
    }),
  );
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
}
