// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { PopupSettingsForm } from "../types.js";
import SettingsPage from "./SettingsPage.vue";

describe("SettingsPage", () => {
  it("renders the existing settings fields and emits save/cancel", async () => {
    const form: PopupSettingsForm = {
      SERVER_URL: "http://localhost:3000",
      MEEGLE_PLUGIN_ID: "MII_PLUGIN",
      meegleUserKey: "7538275242901291040",
      larkUserId: "",
    };

    const wrapper = mount(SettingsPage, {
      props: {
        form,
      },
      global: {
        stubs: {
          PopupPage: {
            props: ["title", "subtitle"],
            template: `
              <section data-test="popup-page">
                <header>
                  <h2>{{ title }}</h2>
                  <p>{{ subtitle }}</p>
                </header>
                <div data-test="popup-page-body"><slot /></div>
                <footer data-test="popup-page-footer"><slot name="footer" /></footer>
              </section>
            `,
          },
          "a-form": {
            template: "<form data-test='settings-form'><slot /></form>",
          },
          "a-form-item": {
            props: ["label"],
            template: "<label><span>{{ label }}</span><slot /></label>",
          },
          "a-input": {
            props: ["value", "placeholder"],
            template: `
              <input
                :value="value"
                :placeholder="placeholder"
                @input="$emit('update:value', $event.target.value)"
              />
            `,
          },
          "a-button": {
            props: ["type"],
            template: "<button :data-type='type' @click=\"$emit('click')\"><slot /></button>",
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Server URL");
    expect(wrapper.text()).toContain("MEEGLE Plugin ID");
    expect(wrapper.text()).toContain("Meegle User Key");
    expect(wrapper.text()).toContain("Lark User ID");
    expect(wrapper.find(".settings-page__actions").exists()).toBe(true);
    expect(wrapper.get(".settings-page__actions").text()).toContain("取消");
    expect(wrapper.get(".settings-page__actions").text()).toContain("保存");
    expect(wrapper.get('[data-test="popup-page-footer"]').text()).toBe("");

    await wrapper.get('[data-test="settings-cancel"]').trigger("click");
    await wrapper.get('[data-test="settings-save"]').trigger("click");

    expect(wrapper.emitted("cancel")).toBeTruthy();
    expect(wrapper.emitted("save")).toBeTruthy();
  });
});
