// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PopupShell from "./PopupShell.vue";

describe("PopupShell", () => {
  it("renders the slot content directly without a header", () => {
    const wrapper = mount(PopupShell, {
      slots: {
        default: "<div data-test='body'>body</div>",
      },
    });

    expect(wrapper.find("[data-test='body']").exists()).toBe(true);
    expect(wrapper.text()).toContain("body");
    expect(wrapper.find(".popup-shell__subtitle").exists()).toBe(false);
  });
});
