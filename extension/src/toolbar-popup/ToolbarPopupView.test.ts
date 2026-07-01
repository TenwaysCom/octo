// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ToolbarPopupView } from "./ToolbarPopupView.js";

describe("ToolbarPopupView", () => {
  it("renders floating icon guidance and ordered auth actions when unauthorized", async () => {
    const user = userEvent.setup();
    const onAuthorizeMeegle = vi.fn();
    const onAuthorizeLark = vi.fn();

    render(
      React.createElement(ToolbarPopupView, {
        pageType: "lark",
        meegleStatusText: "待授权",
        larkStatusText: "待授权",
        meegleAuthorized: false,
        larkAuthorized: false,
        onAuthorizeMeegle,
        onAuthorizeLark,
      }),
    );

    expect(screen.getByText("请使用页面悬浮 Icon")).toBeTruthy();
    expect(screen.getByText("未授权时，请先授权 Meegle，再授权 Lark。")).toBeTruthy();
    expect(screen.queryByText("自动化")).toBeNull();
    expect(screen.queryByText("聊天")).toBeNull();

    await user.click(screen.getByRole("button", { name: "授权 Meegle" }));
    expect(onAuthorizeMeegle).toHaveBeenCalledTimes(1);

    const larkButton = screen.getByRole("button", { name: "授权 Lark" });
    expect(larkButton).toHaveProperty("disabled", true);
    await user.click(larkButton);
    expect(onAuthorizeLark).toHaveBeenCalledTimes(0);
  });

  it("hides auth actions when both providers are already authorized", () => {
    render(
      React.createElement(ToolbarPopupView, {
        pageType: "meegle",
        meegleStatusText: "已授权",
        larkStatusText: "已授权",
        meegleAuthorized: true,
        larkAuthorized: true,
        onAuthorizeMeegle: vi.fn(),
        onAuthorizeLark: vi.fn(),
      }),
    );

    expect(screen.getByText("请使用页面悬浮 Icon")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "授权 Meegle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "授权 Lark" })).toBeNull();
  });
});
