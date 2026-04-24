// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  initialize,
  authorizeLark,
  getConfigMock,
} = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  authorizeLark: vi.fn().mockResolvedValue(undefined),
  getConfigMock: vi.fn().mockResolvedValue({
    MEEGLE_BASE_URL: "https://project.larksuite.com",
  }),
}));

vi.mock("../popup-react/hooks/usePopupApp.js", () => ({
  usePopupApp: () => ({
    initialize,
    authorizeLark,
    state: {
      pageType: "lark",
      currentTabOrigin: "https://foo.larksuite.com",
      isAuthed: {
        meegle: false,
        lark: false,
      },
    },
    meegleStatus: {
      text: "待授权",
    },
    larkStatus: {
      text: "待授权",
    },
  }),
}));

vi.mock("../background/config.js", () => ({
  getConfig: getConfigMock,
}));

vi.mock("./ToolbarPopupView.js", () => ({
  ToolbarPopupView: (props: {
    onAuthorizeMeegle: () => void | Promise<void>;
    onAuthorizeLark: () => void | Promise<void>;
  }) =>
    React.createElement(
      "div",
      { "data-test": "toolbar-popup-view" },
      React.createElement("button", { onClick: props.onAuthorizeMeegle }, "go-meegle"),
      React.createElement("button", { onClick: props.onAuthorizeLark }, "go-lark"),
    ),
}));

import App from "./App.js";

describe("toolbar popup App", () => {
  beforeEach(() => {
    initialize.mockClear();
    authorizeLark.mockClear();
    getConfigMock.mockClear();
    vi.mocked(chrome.tabs.create).mockClear();
  });

  it("runs initialize on mount and wires auth actions", async () => {
    const user = userEvent.setup();
    render(React.createElement(App));

    await waitFor(() => {
      expect(initialize).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "go-meegle" }));
    expect(getConfigMock).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "https://project.larksuite.com",
      active: true,
    });

    await user.click(screen.getByRole("button", { name: "go-lark" }));
    expect(authorizeLark).toHaveBeenCalledTimes(1);
  });
});
