import { createApp } from "vue";
import { describe, expect, it } from "vitest";
import { installPopupUi } from "./install-ui.js";

describe("installPopupUi", () => {
  it("registers the popup's ant design components individually", () => {
    const app = createApp({});

    installPopupUi(app);

    expect(app.component("AButton")).toBeTruthy();
    expect(app.component("ACard")).toBeTruthy();
    expect(app.component("ATag")).toBeTruthy();
    expect(app.component("AEmpty")).toBeTruthy();
    expect(app.component("AApp")).toBeTruthy();
    expect(app.component("AConfigProvider")).toBeTruthy();
    expect(app.component("ASegmented")).toBeTruthy();
    expect(app.component("AForm")).toBeTruthy();
    expect(app.component("AFormItem")).toBeTruthy();
    expect(app.component("AInput")).toBeTruthy();
    expect(app.component("AModal")).toBeFalsy();
  });
});
