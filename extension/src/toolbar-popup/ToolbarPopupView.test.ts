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
        environmentName: "prod",
        serverUrl: "https://octo.odoo.tenways.it:18443",
        onEnvironmentChange: vi.fn(),
        onSaveEnvironment: vi.fn(),
        onAuthorizeMeegle,
        onAuthorizeLark,
      }),
    );

    expect(screen.getByText("请使用页面悬浮 Icon")).toBeTruthy();
    expect(
      screen.getByText("授权状态").compareDocumentPosition(screen.getByText("环境配置")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
        environmentName: "test",
        serverUrl: "https://octotest.odoo.tenways.it:18443",
        onEnvironmentChange: vi.fn(),
        onSaveEnvironment: vi.fn(),
        onAuthorizeMeegle: vi.fn(),
        onAuthorizeLark: vi.fn(),
      }),
    );

    expect(screen.getByText("请使用页面悬浮 Icon")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "授权 Meegle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "授权 Lark" })).toBeNull();
  });

  it("renders environment configuration and saves changes", async () => {
    const user = userEvent.setup();
    const onEnvironmentChange = vi.fn();
    const onSaveEnvironment = vi.fn();

    render(
      React.createElement(ToolbarPopupView, {
        pageType: "github",
        meegleStatusText: "已授权",
        larkStatusText: "已授权",
        meegleAuthorized: true,
        larkAuthorized: true,
        environmentName: "prod",
        serverUrl: "https://octo.odoo.tenways.it:18443",
        onEnvironmentChange,
        onSaveEnvironment,
        onAuthorizeMeegle: vi.fn(),
        onAuthorizeLark: vi.fn(),
      }),
    );

    expect(screen.getByText("环境配置")).toBeTruthy();
    expect(screen.getByText("Server URL: https://octo.odoo.tenways.it:18443")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Environment"), "dev");
    expect(onEnvironmentChange).toHaveBeenCalledWith("dev");

    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSaveEnvironment).toHaveBeenCalledTimes(1);
  });
});
