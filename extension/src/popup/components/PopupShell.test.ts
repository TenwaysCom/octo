// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PopupShell from "./PopupShell.vue";

describe("PopupShell", () => {
  it("shows a clean brand header without the legacy chinese description or settings button", () => {
    const wrapper = mount(PopupShell, {
      props: {
        subtitle: null,
      },
      slots: {
        default: "<div>body</div>",
      },
      global: {
        stubs: {
          "a-button": {
            template: "<button><slot /></button>",
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Tenways Octo");
    expect(wrapper.text()).not.toContain("跨平台协同助手");
    expect(wrapper.find('[data-test="popup-shell-settings"]').exists()).toBe(false);
    expect(wrapper.find(".popup-shell__subtitle").exists()).toBe(false);
  });

  it("renders the dynamic core status only when it is provided", () => {
    const wrapper = mount(PopupShell, {
      props: {
        subtitle: "Lark · Base · Generate Draft · Running",
      },
      slots: {
        default: "<div>body</div>",
      },
      global: {
        stubs: {
          "a-button": {
            template: "<button><slot /></button>",
          },
        },
      },
    });

    expect(wrapper.find(".popup-shell__subtitle").text()).toContain(
      "Lark · Base · Generate Draft · Running",
    );
  });
});
