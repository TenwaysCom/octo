// @vitest-environment jsdom

import React, { useMemo, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { KimiChatSessionSummary, KimiChatTranscriptEntry } from "../types/acp-kimi.js";
import type { PopupNotebookPage, PopupSettingsForm } from "../popup/types.js";
import type { PopupAppModel } from "./types.js";
import { PopupAppView } from "./PopupAppView.js";

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

describe("popup-react chat page", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("renders the lazy chat page through the assistant-ui path when chat is active", async () => {
    await renderPopupApp({
      initialPage: "chat",
      transcript: [
        {
          id: "assistant-1",
          kind: "assistant",
          text: "你好，我可以帮你整理当前页面上下文。",
        },
      ],
    });

    expect(
      await screen.findByTestId("assistant-ui-thread", undefined, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.getByTestId("assistant-ui-composer")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "发送消息" })).toBeTruthy();
    expect(screen.getByText("你好，我可以帮你整理当前页面上下文。")).toBeTruthy();
  });

  it("renders assistant thoughts through the native chain-of-thought path instead of the legacy sidecar", async () => {
    const { user } = await renderPopupApp({
      initialPage: "chat",
      transcript: [
        {
          id: "assistant-1",
          kind: "assistant",
          text: "我先检查当前页面上下文。",
          thoughts: [
            {
              id: "thought-1",
              text: "先确认当前页面支持的实体类型。",
            },
          ],
          toolCalls: [
            {
              id: "tool-1",
              title: "Inspect page context",
              status: "completed",
              detail: "读取页面标题与链接信息",
            },
          ],
        },
      ],
    });

    const trigger = await screen.findByRole("button", { name: /思考过程/i });

    expect(screen.queryByText("思路")).toBeNull();
    expect(screen.queryByText("工具")).toBeNull();
    expect(screen.queryByText("先确认当前页面支持的实体类型。")).toBeNull();

    await user.click(trigger);

    expect(screen.getByText("先确认当前页面支持的实体类型。")).toBeTruthy();
  });

  it("renders tool call title, status, and detail through the native tool-call path", async () => {
    const { user } = await renderPopupApp({
      initialPage: "chat",
      transcript: [
        {
          id: "assistant-1",
          kind: "assistant",
          text: "我先检查当前页面上下文。",
          toolCalls: [
            {
              id: "tool-1",
              title: "Inspect page context",
              status: "completed",
              detail: "读取页面标题与链接信息",
            },
          ],
        },
      ],
    });

    await user.click(await screen.findByRole("button", { name: /思考过程/i }));

    expect(screen.getByText("Inspect page context")).toBeTruthy();
    expect(screen.getAllByText("已完成").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("读取页面标题与链接信息")).toBeTruthy();
  });

  it("derives the chain-of-thought badge from native tool status while a tool is still running", async () => {
    const { user } = await renderPopupApp({
      initialPage: "chat",
      transcript: [
        {
          id: "assistant-1",
          kind: "assistant",
          text: "我正在继续检查当前页面上下文。",
          toolCalls: [
            {
              id: "tool-1",
              title: "Inspect page context",
              status: "in_progress",
              detail: "仍在读取页面标题与链接信息",
            },
          ],
        },
      ],
    });

    const trigger = await screen.findByRole("button", { name: /思考过程/i });
    await user.click(trigger);

    expect(trigger.textContent?.includes("进行中")).toBe(true);
    expect(screen.getByText("仍在读取页面标题与链接信息")).toBeTruthy();
  });

  it("keeps the chain-of-thought badge in running state for reasoning-only streaming turns", async () => {
    const { user } = await renderPopupApp({
      initialPage: "chat",
      busy: true,
      transcript: [
        {
          id: "assistant-1",
          kind: "assistant",
          text: "我正在继续分析这个问题。",
          thoughts: [
            {
              id: "thought-1",
              text: "先确认约束，再决定下一步。",
            },
          ],
        },
      ],
    });

    const trigger = await screen.findByRole("button", { name: /思考过程/i });
    await user.click(trigger);

    expect(trigger.textContent?.includes("进行中")).toBe(true);
    expect(screen.getByText("先确认约束，再决定下一步。")).toBeTruthy();
  });

  it("keeps the chain-of-thought badge in running state when a tool has completed but the assistant is still streaming", async () => {
    const { user } = await renderPopupApp({
      initialPage: "chat",
      busy: true,
      transcript: [
        {
          id: "assistant-1",
          kind: "assistant",
          text: "我正在继续汇总工具结果。",
          toolCalls: [
            {
              id: "tool-1",
              title: "Inspect page context",
              status: "completed",
              detail: "页面标题与链接信息已读取完成",
            },
          ],
        },
      ],
    });

    const trigger = await screen.findByRole("button", { name: /思考过程/i });
    await user.click(trigger);

    expect(trigger.textContent?.includes("进行中")).toBe(true);
    expect(screen.getByText("页面标题与链接信息已读取完成")).toBeTruthy();
  });

  it("renders assistant markdown transcript content with the existing safe markdown renderer", async () => {
    const { container } = await renderPopupApp({
      initialPage: "chat",
      transcript: [
        {
          id: "assistant-markdown",
          kind: "assistant",
          text: "Use `session.abort`.\n\n```ts\nconst value = `<tag>`;\n```",
        },
      ],
    });

    await screen.findByText("Kimi");

    const inlineCode = container.querySelector(".kimi-chat-markdown__inline-code");
    const fencedCode = container.querySelector(".kimi-chat-markdown__code[data-lang='ts']");

    expect(inlineCode?.textContent).toBe("session.abort");
    expect(fencedCode?.textContent).toBe("const value = `<tag>`;");
    expect(screen.queryByText("```ts")).toBeNull();
  });

  it("sends via the chat composer using the existing popup send flow", async () => {
    const sendKimiChatMessage = vi.fn(async () => undefined);
    const updateKimiChatDraftMessage = vi.fn();
    const { unmount, user } = await renderPopupApp({
      initialPage: "chat",
      sendKimiChatMessage,
      updateKimiChatDraftMessage,
    });

    await user.type(await screen.findByRole("textbox", { name: "发送消息" }), "请总结一下当前需求");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(sendKimiChatMessage).toHaveBeenCalledWith("请总结一下当前需求");
    expect(updateKimiChatDraftMessage).toHaveBeenCalled();

    unmount();
  });

  it("keeps history and session toolbar actions wired to the existing popup model", async () => {
    const openKimiChatHistory = vi.fn();
    const closeKimiChatHistory = vi.fn();
    const resetKimiChatSession = vi.fn();
    const loadKimiChatHistorySession = vi.fn();
    const deleteKimiChatHistorySession = vi.fn();
    const stopKimiChatGeneration = vi.fn();
    const { user } = await renderPopupApp({
      initialPage: "chat",
      busy: true,
      historyOpen: true,
      historyItems: [
        {
          sessionId: "sess_1",
          title: "旧会话",
          updatedAt: "2026-04-18T00:00:00Z",
        },
      ],
      openKimiChatHistory,
      closeKimiChatHistory,
      resetKimiChatSession,
      loadKimiChatHistorySession,
      deleteKimiChatHistorySession,
      stopKimiChatGeneration,
    });

    const composerInput = await screen.findByRole("textbox", { name: "发送消息" });
    const sendButton = screen.getByRole("button", { name: "发送" });

    expect((sendButton as HTMLButtonElement).disabled).toBe(true);
    expect((composerInput as HTMLTextAreaElement).value).toBe("");

    await user.click(screen.getByRole("button", { name: "关闭历史" }));
    await user.click(screen.getByRole("button", { name: "新会话" }));
    await user.click(screen.getByRole("button", { name: "停止" }));
    await user.click(screen.getByRole("button", { name: "打开" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(openKimiChatHistory).not.toHaveBeenCalled();
    expect(closeKimiChatHistory).toHaveBeenCalledTimes(1);
    expect(resetKimiChatSession).toHaveBeenCalledTimes(1);
    expect(stopKimiChatGeneration).toHaveBeenCalledTimes(1);
    expect(loadKimiChatHistorySession).toHaveBeenCalledWith("sess_1");
    expect(deleteKimiChatHistorySession).toHaveBeenCalledWith("sess_1");
  });
});

async function renderPopupApp(
  options: {
    busy?: boolean;
    historyItems?: KimiChatSessionSummary[];
    historyOpen?: boolean;
    initialPage?: PopupNotebookPage;
    pageType?: "lark" | "meegle" | "unsupported";
    showUnsupported?: boolean;
    draftMessage?: string;
    transcript?: KimiChatTranscriptEntry[];
    sendKimiChatMessage?: PopupAppModel["sendKimiChatMessage"];
    updateKimiChatDraftMessage?: PopupAppModel["updateKimiChatDraftMessage"];
    resetKimiChatSession?: PopupAppModel["resetKimiChatSession"];
    openKimiChatHistory?: PopupAppModel["openKimiChatHistory"];
    closeKimiChatHistory?: PopupAppModel["closeKimiChatHistory"];
    loadKimiChatHistorySession?: PopupAppModel["loadKimiChatHistorySession"];
    deleteKimiChatHistorySession?: PopupAppModel["deleteKimiChatHistorySession"];
    stopKimiChatGeneration?: PopupAppModel["stopKimiChatGeneration"];
  } = {},
) {
  const user = userEvent.setup();

  const result = render(
    React.createElement(function PopupAppHarness() {
      const [activePage, setActivePage] = useState<PopupNotebookPage>(
        options.initialPage ?? "automation",
      );
      const [busy, setBusy] = useState(options.busy ?? false);
      const [draftMessage, setDraftMessage] = useState(options.draftMessage ?? "");
      const [transcript, setTranscript] = useState<KimiChatTranscriptEntry[]>(
        options.transcript ?? [],
      );
      const [settingsForm, setSettingsForm] = useState<PopupSettingsForm>({
        SERVER_URL: "http://localhost:3000",
        MEEGLE_PLUGIN_ID: "MII_PLUGIN",
        LARK_OAUTH_CALLBACK_URL: "http://localhost:3000/api/lark/auth/callback",
        meegleUserKey: "7538275242901291040",
        larkUserId: "ou_test_user",
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
          larkActions: [],
          meegleActions: [],
          githubActions: [],
          larkBulkCreateModal: {
            visible: false,
            stage: "hidden",
            preview: null,
            result: null,
            bulkError: null,
          },
          showKimiChat: true,
          kimiChatTranscript: transcript,
          kimiChatBusy: busy,
          kimiChatSessionId: null,
          kimiChatDraftMessage: draftMessage,
          kimiChatHistoryOpen: options.historyOpen ?? false,
          kimiChatHistoryLoading: false,
          kimiChatHistoryItems: options.historyItems ?? [],
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
          closeLarkBulkCreateModal: vi.fn(),
          resetKimiChatSession: (() => {
            setDraftMessage("");
            setTranscript([]);
            options.resetKimiChatSession?.();
          }) as PopupAppModel["resetKimiChatSession"],
          openKimiChatHistory: options.openKimiChatHistory ?? vi.fn(),
          closeKimiChatHistory: options.closeKimiChatHistory ?? vi.fn(),
          loadKimiChatHistorySession: options.loadKimiChatHistorySession ?? vi.fn(),
          deleteKimiChatHistorySession: options.deleteKimiChatHistorySession ?? vi.fn(),
          updateKimiChatDraftMessage:
            options.updateKimiChatDraftMessage ??
            vi.fn((value: string) => {
              setDraftMessage(value);
            }),
          sendKimiChatMessage: (async (message: string) => {
            setTranscript((previous) => [
              ...previous,
              {
                id: `user-${previous.length + 1}`,
                kind: "user",
                text: message,
              },
            ]);
            await options.sendKimiChatMessage?.(message);
          }) as PopupAppModel["sendKimiChatMessage"],
          stopKimiChatGeneration: (() => {
            setBusy(false);
            options.stopKimiChatGeneration?.();
          }) as PopupAppModel["stopKimiChatGeneration"],
          ignoreUpdateVersion: vi.fn(),
          downloadUpdate: vi.fn(),
          lookupGitHubPr: vi.fn(),
        }),
        [activePage, busy, draftMessage, options, settingsForm, transcript],
      );

      popupApp.updateKimiChatDraftMessage = ((value: string) => {
        setDraftMessage(value);
        options.updateKimiChatDraftMessage?.(value);
      }) as PopupAppModel["updateKimiChatDraftMessage"];

      return React.createElement(PopupAppView, { popupApp });
    }),
  );

  return {
    user,
    ...result,
  };
}
