// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import VerticalTabBar from "./VerticalTabBar.vue";

describe("VerticalTabBar", () => {
  it("keeps settings available even when the user is not fully authorized", async () => {
    const wrapper = mount(VerticalTabBar, {
      props: {
        modelValue: "profile",
        authorized: false,
      },
    });

    await wrapper.get('[data-test="vertical-tab-settings"]').trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["settings"]]);
  });

  it("still blocks chat and automation when the user is not fully authorized", async () => {
    const wrapper = mount(VerticalTabBar, {
      props: {
        modelValue: "profile",
        authorized: false,
      },
    });

    await wrapper.get('[data-test="vertical-tab-chat"]').trigger("click");
    await wrapper.get('[data-test="vertical-tab-automation"]').trigger("click");

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});
