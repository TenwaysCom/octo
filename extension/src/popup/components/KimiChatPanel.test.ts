// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

describe("KimiChatPanel", () => {
  it("renders assistant details, status summaries, raw fallbacks, and emits one send event from a single input", async () => {
    const componentPath = "./AcpChatPanel.vue";
    const { default: AcpChatPanel } = await import(
      /* @vite-ignore */ componentPath
    );

    const wrapper = mount(AcpChatPanel, {
      props: {
        transcript: [
          {
            id: "user-1",
            kind: "user",
            text: "请介绍一下会话状态",
          },
          {
            id: "assistant-1",
            kind: "assistant",
            text: "你好，我先帮你看一下。",
            thoughts: [
              {
                id: "thought-1",
                text: "先看上下文",
              },
            ],
            toolCalls: [
              {
                id: "tool-1",
                title: "Read file",
                status: "completed",
                detail: "/tmp/spec.md",
              },
            ],
          },
          {
            id: "status-1",
            kind: "status",
            text: "计划已更新 · 2 项（1 进行中，1 待开始，0 已完成）",
          },
          {
            id: "raw-1",
            kind: "raw",
            label: "config_option_update",
            raw: "{\"sessionUpdate\":\"config_option_update\"}",
          },
        ],
        busy: false,
        draftMessage: "",
      },
    });

    expect(wrapper.text()).toContain("请介绍一下会话状态");
    expect(wrapper.text()).toContain("你好，我先帮你看一下。");
    expect(wrapper.text()).toContain("思路");
    expect(wrapper.text()).toContain("先看上下文");
    expect(wrapper.text()).toContain("工具");
    expect(wrapper.text()).toContain("Read file");
    expect(wrapper.text()).toContain("/tmp/spec.md");
    expect(wrapper.text()).toContain("计划已更新");
    expect(wrapper.text()).toContain("原始事件");
    expect(wrapper.text()).toContain("config_option_update");

    await wrapper.get("input").setValue("再来一条");
    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("update:draftMessage")).toEqual([
      ["再来一条"],
      [""],
    ]);
    expect(wrapper.emitted("send")).toEqual([["再来一条"]]);
  });

  it("shows a stop button while busy and emits stop without re-enabling input", async () => {
    const componentPath = "./AcpChatPanel.vue";
    const { default: AcpChatPanel } = await import(
      /* @vite-ignore */ componentPath
    );

    const wrapper = mount(AcpChatPanel, {
      props: {
        transcript: [
          {
            id: "assistant-1",
            kind: "assistant",
            text: "```ts\nconst value = 1;",
          },
        ],
        busy: true,
        draftMessage: "继续生成",
      },
    });

    expect(wrapper.get('[data-test="kimi-chat-input"]').attributes("disabled")).toBe("");
    expect(wrapper.get('[data-test="kimi-chat-stop"]').text()).toContain("停止");

    await wrapper.get('[data-test="kimi-chat-stop"]').trigger("click");

    expect(wrapper.emitted("stop")).toEqual([[]]);
  });
});
