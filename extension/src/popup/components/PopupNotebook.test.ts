// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PopupNotebook from "./PopupNotebook.vue";

describe("PopupNotebook", () => {
  it("renders home and settings tabs and emits page changes", async () => {
    const wrapper = mount(PopupNotebook, {
      props: {
        modelValue: "home",
      },
      global: {
        stubs: {
          "a-segmented": {
            props: ["value", "options"],
            template: `
              <div data-test="popup-notebook">
                <button data-test="popup-tab-home" @click="$emit('change', 'home')">
                  {{ options[0].label }}
                </button>
                <button data-test="popup-tab-settings" @click="$emit('change', 'settings')">
                  {{ options[1].label }}
                </button>
              </div>
            `,
          },
        },
      },
    });

    expect(wrapper.get('[data-test="popup-tab-home"]').text()).toBe("主页");
    expect(wrapper.get('[data-test="popup-tab-settings"]').text()).toBe("设置");

    await wrapper.get('[data-test="popup-tab-settings"]').trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["settings"]]);
  });
});
