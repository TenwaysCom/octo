import { createApp } from "vue";
import { describe, expect, it } from "vitest";
import { installPopupUi } from "./install-ui.js";

describe("installPopupUi", () => {
  it("registers only the ant design container components used by the popup shell", () => {
    const app = createApp({});

    installPopupUi(app);

    expect(app.component("AApp")).toBeTruthy();
    expect(app.component("AConfigProvider")).toBeTruthy();
    expect(app.component("AButton")).toBeFalsy();
    expect(app.component("ACard")).toBeFalsy();
    expect(app.component("ATag")).toBeFalsy();
    expect(app.component("AEmpty")).toBeFalsy();
    expect(app.component("ASegmented")).toBeFalsy();
    expect(app.component("AForm")).toBeFalsy();
    expect(app.component("AFormItem")).toBeFalsy();
    expect(app.component("AInput")).toBeFalsy();
  });
});
