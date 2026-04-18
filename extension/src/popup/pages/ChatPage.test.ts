// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

describe("ChatPage", () => {
  it("shows a session toolbar and empty-state guidance when the transcript is empty", async () => {
    const { default: ChatPage } = await import("./ChatPage.vue");

    const wrapper = mount(ChatPage, {
      props: {
        viewModel: {
          subtitle: "Lark",
          showUnsupported: false,
          showAuthBlockTop: true,
          showLarkFeatureBlock: false,
          showMeegleFeatureBlock: false,
          canAnalyze: false,
          canDraft: false,
          canApply: false,
        },
        showKimiChat: true,
        kimiChatSessionId: null,
        kimiChatTranscript: [],
        kimiChatBusy: false,
        kimiChatDraftMessage: "",
        kimiChatHistoryOpen: false,
        kimiChatHistoryLoading: false,
        kimiChatHistoryItems: [],
      },
      global: {
        stubs: {
          AcpChatPanel: {
            template: "<div data-test='acp-chat-panel-stub' />",
          },
        },
      },
    });

    expect(wrapper.get('[data-test="chat-page"]').text()).toContain("ACP");
    expect(wrapper.get('[data-test="chat-page"]').text()).toContain("新会话");
    expect(wrapper.get('[data-test="chat-page"]').text()).toContain("历史会话");
    expect(wrapper.get('[data-test="chat-page"]').text()).toContain("还没有消息");
  });

  it("renders the chat panel when the transcript has content and forwards toolbar events", async () => {
    const { default: ChatPage } = await import("./ChatPage.vue");

    const wrapper = mount(ChatPage, {
      props: {
        viewModel: {
          subtitle: "Lark",
          showUnsupported: false,
          showAuthBlockTop: true,
          showLarkFeatureBlock: false,
          showMeegleFeatureBlock: false,
          canAnalyze: false,
          canDraft: false,
          canApply: false,
        },
        showKimiChat: true,
        kimiChatSessionId: null,
        kimiChatTranscript: [
          {
            id: "assistant-1",
            kind: "assistant",
            text: "hello",
          },
        ],
        kimiChatBusy: false,
        kimiChatDraftMessage: "",
        kimiChatHistoryOpen: false,
        kimiChatHistoryLoading: false,
        kimiChatHistoryItems: [],
      },
      global: {
        stubs: {
          AcpChatPanel: {
            template: "<div data-test='acp-chat-panel-stub' />",
          },
        },
      },
    });

    expect(wrapper.find('[data-test="acp-chat-panel-stub"]').exists()).toBe(true);

    await wrapper.get('[data-test="chat-new-session"]').trigger("click");
    await wrapper.get('[data-test="chat-open-history"]').trigger("click");

    expect(wrapper.emitted("resetKimiChatSession")).toEqual([[]]);
    expect(wrapper.emitted("openKimiChatHistory")).toEqual([[]]);
  });

  it("forwards a real composer send event to the page-level send handler", async () => {
    const { default: ChatPage } = await import("./ChatPage.vue");

    const wrapper = mount(ChatPage, {
      props: {
        viewModel: {
          subtitle: "Lark",
          showUnsupported: false,
          showAuthBlockTop: true,
          showLarkFeatureBlock: false,
          showMeegleFeatureBlock: false,
          canAnalyze: false,
          canDraft: false,
          canApply: false,
        },
        showKimiChat: true,
        kimiChatSessionId: null,
        kimiChatTranscript: [],
        kimiChatBusy: false,
        kimiChatDraftMessage: "",
        kimiChatHistoryOpen: false,
        kimiChatHistoryLoading: false,
        kimiChatHistoryItems: [],
      },
    });

    await wrapper.get('[data-test="kimi-chat-input"]').setValue("请帮我总结一下");
    await wrapper.get('[data-test="kimi-chat-send"]').trigger("click");

    expect(wrapper.emitted("sendKimiChatMessage")).toEqual([["请帮我总结一下"]]);
  });

  it("renders the history panel above the chat box and forwards load/delete actions", async () => {
    const { default: ChatPage } = await import("./ChatPage.vue");

    const wrapper = mount(ChatPage, {
      props: {
        viewModel: {
          subtitle: "Lark",
          showUnsupported: false,
          showAuthBlockTop: true,
          showLarkFeatureBlock: false,
          showMeegleFeatureBlock: false,
          canAnalyze: false,
          canDraft: false,
          canApply: false,
        },
        showKimiChat: true,
        kimiChatSessionId: "sess_2",
        kimiChatTranscript: [],
        kimiChatBusy: false,
        kimiChatDraftMessage: "",
        kimiChatHistoryOpen: true,
        kimiChatHistoryLoading: false,
        kimiChatHistoryItems: [
          {
            sessionId: "sess_1",
            title: "旧会话",
            updatedAt: "2026-04-18T00:00:00Z",
          },
          {
            sessionId: "sess_2",
            title: "当前会话",
            updatedAt: "2026-04-18T00:01:00Z",
          },
        ],
      },
    });

    expect(wrapper.find('[data-test="chat-history-panel"]').exists()).toBe(true);
    expect(wrapper.get('[data-test="chat-history-panel"]').text()).toContain("旧会话");
    expect(wrapper.get('[data-test="chat-history-panel"]').text()).toContain("当前会话");
    expect(wrapper.get('[data-test="chat-history-panel"]').text()).toContain("2026-04-18 08:00");

    await wrapper.get('[data-test="chat-history-load-sess_1"]').trigger("click");
    await wrapper.get('[data-test="chat-history-delete-sess_2"]').trigger("click");
    await wrapper.get('[data-test="chat-history-close"]').trigger("click");

    expect(wrapper.emitted("loadKimiChatHistorySession")).toEqual([["sess_1"]]);
    expect(wrapper.emitted("deleteKimiChatHistorySession")).toEqual([["sess_2"]]);
    expect(wrapper.emitted("closeKimiChatHistory")).toEqual([[]]);
  });
});
