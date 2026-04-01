// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AuthStatusCard from "./AuthStatusCard.vue";

describe("AuthStatusCard", () => {
  it("hides the Meegle auth button once the auth state is already ready", () => {
    const wrapper = mount(AuthStatusCard, {
      props: {
        title: "授权状态",
        meegleStatus: { tone: "success", text: "已授权" },
        larkStatus: { tone: "default", text: "-" },
        meegleButtonText: "已授权",
        larkButtonText: "授权",
        meegleButtonDisabled: true,
        larkButtonDisabled: false,
      },
      global: {
        stubs: {
          "a-card": {
            template: "<div><slot /></div>",
          },
          "a-tag": {
            props: ["color"],
            template: "<span><slot /></span>",
          },
          "a-button": {
            props: ["disabled", "type", "size"],
            template:
              "<button :data-disabled='String(Boolean(disabled))'><slot /></button>",
          },
        },
      },
    });

    expect(wrapper.text()).toContain("已授权");
    expect(wrapper.findAll("button")).toHaveLength(1);
    expect(wrapper.find("button").text()).toBe("授权");
  });
});
