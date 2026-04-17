// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PopupNotebook from "./PopupNotebook.vue";

describe("PopupNotebook", () => {
  it("renders chat, automation, settings and profile tabs and emits page changes", async () => {
    const wrapper = mount(PopupNotebook, {
      props: {
        modelValue: "chat",
      },
      global: {
        stubs: {
          "a-segmented": {
            props: ["value", "options"],
            template: `
              <div data-test="popup-notebook">
                <button data-test="popup-tab-chat" @click="$emit('change', 'chat')">
                  {{ options[0].label }}
                </button>
                <button data-test="popup-tab-automation" @click="$emit('change', 'automation')">
                  {{ options[1].label }}
                </button>
                <button data-test="popup-tab-settings" @click="$emit('change', 'settings')">
                  {{ options[2].label }}
                </button>
                <button data-test="popup-tab-profile" @click="$emit('change', 'profile')">
                  {{ options[3].label }}
                </button>
              </div>
            `,
          },
        },
      },
    });

    expect(wrapper.get('[data-test="popup-tab-chat"]').text()).toBe("聊天");
    expect(wrapper.get('[data-test="popup-tab-settings"]').text()).toBe("设置");

    await wrapper.get('[data-test="popup-tab-settings"]').trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["settings"]]);
  });
});
