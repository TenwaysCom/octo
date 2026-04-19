// @vitest-environment jsdom

import React, { useMemo, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PopupNotebookPage, PopupSettingsForm } from "../popup/types.js";
import type { PopupAppModel } from "./types.js";
import { PopupAppView } from "./PopupAppView.js";

describe("popup-react shell", () => {
  it("renders the automation page by default", () => {
    const { container } = renderPopupApp();

    expect(container.querySelector('[data-test="automation-page"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "分析当前页面" })).toBeTruthy();
    expect(container.querySelector('[data-test="settings-page"]')).toBeNull();
  });

  it("navigates to settings and profile via the tab bar", async () => {
    const { container, user } = renderPopupApp();

    await user.click(screen.getByRole("button", { name: "设置" }));
    expect(container.querySelector('[data-test="settings-page"]')).not.toBeNull();
    expect(container.querySelector('[data-test="profile-page"]')).toBeNull();

    await user.click(screen.getByRole("button", { name: "个人" }));
    expect(container.querySelector('[data-test="profile-page"]')).not.toBeNull();
    expect(container.querySelector('[data-test="settings-page"]')).toBeNull();
  });

  it("renders unsupported UI when chat is opened on an unsupported page", async () => {
    const { container } = renderPopupApp({
      initialPage: "chat",
      pageType: "unsupported",
      showUnsupported: true,
    });

    expect(await screen.findByText("当前页面不支持")).toBeTruthy();
    expect(container.querySelector('[data-test="unsupported-view"]')).not.toBeNull();
    expect(container.querySelector('[data-test="chat-page"]')).toBeNull();
  });

});

function renderPopupApp(
  options: {
    bulkModalVisible?: boolean;
    bulkModalStage?: "hidden" | "preview" | "executing" | "result";
    initialPage?: PopupNotebookPage;
    pageType?: "lark" | "meegle" | "unsupported";
    showUnsupported?: boolean;
  } = {},
) {
  const user = userEvent.setup();

  const result = render(
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
                    title: "Record one",
                    priority: "P0",
                  },
                ],
                skippedRecords: [],
              }
            : null,
        result: null,
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
          larkBulkCreateModal: bulkModal,
          showKimiChat: false,
          kimiChatTranscript: [],
          kimiChatBusy: false,
          kimiChatSessionId: null,
          kimiChatDraftMessage: "",
          kimiChatHistoryOpen: false,
          kimiChatHistoryLoading: false,
          kimiChatHistoryItems: [],
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
        }),
        [activePage, bulkModal, options.pageType, options.showUnsupported, settingsForm],
      );

      return React.createElement(PopupAppView, { popupApp });
    }),
  );

  return {
    user,
    ...result,
  };
}
