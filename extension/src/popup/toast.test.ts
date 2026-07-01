// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { showPopupToast } from "./toast";

describe("showPopupToast", () => {
  it("normalizes debug to the info toast tone", () => {
    showPopupToast("debug message", "debug");

    const toast = document.querySelector(".popup-toast");

    expect(toast?.className).toContain("popup-toast--info");
    expect(toast?.className).not.toContain("popup-toast--debug");
  });
});
