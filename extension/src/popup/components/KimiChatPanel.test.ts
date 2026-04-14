// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

describe("KimiChatPanel", () => {
  it("renders transcript entries and emits one send event from a single input", async () => {
    const componentPath = "./KimiChatPanel.vue";
    const { default: KimiChatPanel } = await import(
      /* @vite-ignore */ componentPath
    );

    const wrapper = mount(KimiChatPanel, {
      props: {
        transcript: [
          { id: "session.created", text: "session.created" },
          { id: "acp.session.update-1", text: "你好" },
        ],
        busy: false,
        draftMessage: "",
      },
    });

    expect(wrapper.text()).toContain("session.created");
    expect(wrapper.text()).toContain("你好");

    await wrapper.get("input").setValue("再来一条");
    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("update:draftMessage")).toEqual([
      ["再来一条"],
      [""],
    ]);
    expect(wrapper.emitted("send")).toEqual([["再来一条"]]);
  });
});
