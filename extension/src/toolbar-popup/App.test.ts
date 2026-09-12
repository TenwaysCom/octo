// @vitest-environment jsdom
/// <reference types="vitest/globals" />

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, vi } from "vitest";

const {
  initialize,
  authorizeMeegle,
  authorizeLark,
  updateSettingsFormField,
  saveSettingsForm,
  getConfigMock,
  popupState,
} = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  authorizeMeegle: vi.fn().mockResolvedValue(undefined),
  authorizeLark: vi.fn().mockResolvedValue(undefined),
  updateSettingsFormField: vi.fn(),
  saveSettingsForm: vi.fn().mockResolvedValue(undefined),
  getConfigMock: vi.fn().mockResolvedValue({
    MEEGLE_BASE_URL: "https://project.larksuite.com",
  }),
  popupState: {
    pageType: "lark",
    currentTabOrigin: "https://foo.larksuite.com",
  },
}));

vi.mock("../popup-react/hooks/usePopupApp.js", () => ({
  usePopupApp: () => ({
    initialize,
    authorizeMeegle,
    authorizeLark,
    updateSettingsFormField,
    saveSettingsForm,
    settingsForm: {
      ENV_NAME: "prod",
      SERVER_URL: "https://octo.odoo.tenways.it:18443",
    },
    state: {
      ...popupState,
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
    environmentName: string;
    serverUrl: string;
    onEnvironmentChange: (environmentName: "prod" | "test" | "dev") => void;
    onSaveEnvironment: () => void | Promise<void>;
    onMeegleAction: () => void | Promise<void>;
    onAuthorizeLark: () => void | Promise<void>;
  }) =>
    React.createElement(
      "div",
      { "data-test": "toolbar-popup-view" },
      React.createElement("span", null, props.environmentName),
      React.createElement("span", null, props.serverUrl),
      React.createElement(
        "select",
        {
          "aria-label": "Environment",
          value: props.environmentName,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
            props.onEnvironmentChange(event.target.value as "prod" | "test" | "dev"),
        },
        React.createElement("option", { value: "prod" }, "prod"),
        React.createElement("option", { value: "test" }, "test"),
        React.createElement("option", { value: "dev" }, "dev"),
      ),
      React.createElement("button", { onClick: props.onSaveEnvironment }, "save-env"),
      React.createElement("button", { onClick: props.onMeegleAction }, "go-meegle"),
      React.createElement("button", { onClick: props.onAuthorizeLark }, "go-lark"),
    ),
}));

import App from "./App.js";

describe("toolbar popup App", () => {
  beforeEach(() => {
    initialize.mockClear();
    authorizeMeegle.mockClear();
    authorizeLark.mockClear();
    updateSettingsFormField.mockClear();
    saveSettingsForm.mockClear();
    getConfigMock.mockClear();
    vi.mocked(chrome.tabs.create).mockClear();
    popupState.pageType = "lark";
    popupState.currentTabOrigin = "https://foo.larksuite.com";
  });

  it("opens Meegle when the current tab is not a Meegle page", async () => {
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
    expect(authorizeMeegle).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "go-lark" }));
    expect(authorizeLark).toHaveBeenCalledTimes(1);
  });

  it("authorizes Meegle directly when the current tab is a Meegle page", async () => {
    popupState.pageType = "meegle";
    popupState.currentTabOrigin = "https://project.larksuite.com";
    const user = userEvent.setup();
    render(React.createElement(App));

    await user.click(screen.getByRole("button", { name: "go-meegle" }));

    expect(authorizeMeegle).toHaveBeenCalledTimes(1);
    expect(getConfigMock).not.toHaveBeenCalled();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("wires environment changes to popup settings", async () => {
    const user = userEvent.setup();
    render(React.createElement(App));

    expect(screen.getByText("https://octo.odoo.tenways.it:18443")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Environment"), "dev");
    expect(updateSettingsFormField).toHaveBeenCalledWith("ENV_NAME", "dev");

    await user.click(screen.getByRole("button", { name: "save-env" }));
    expect(saveSettingsForm).toHaveBeenCalledTimes(1);
  });
});
