// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  initialize,
  authorizeLark,
  updateSettingsFormField,
  saveSettingsForm,
  getConfigMock,
} = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  authorizeLark: vi.fn().mockResolvedValue(undefined),
  updateSettingsFormField: vi.fn(),
  saveSettingsForm: vi.fn().mockResolvedValue(undefined),
  getConfigMock: vi.fn().mockResolvedValue({
    MEEGLE_BASE_URL: "https://project.larksuite.com",
  }),
}));

vi.mock("../popup-react/hooks/usePopupApp.js", () => ({
  usePopupApp: () => ({
    initialize,
    authorizeLark,
    updateSettingsFormField,
    saveSettingsForm,
    settingsForm: {
      ENV_NAME: "prod",
      SERVER_URL: "https://octo.odoo.tenways.it:18443",
    },
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
    environmentName: string;
    serverUrl: string;
    onEnvironmentChange: (environmentName: "prod" | "test" | "dev") => void;
    onSaveEnvironment: () => void | Promise<void>;
    onAuthorizeMeegle: () => void | Promise<void>;
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
      React.createElement("button", { onClick: props.onAuthorizeMeegle }, "go-meegle"),
      React.createElement("button", { onClick: props.onAuthorizeLark }, "go-lark"),
    ),
}));

import App from "./App.js";

describe("toolbar popup App", () => {
  beforeEach(() => {
    initialize.mockClear();
    authorizeLark.mockClear();
    updateSettingsFormField.mockClear();
    saveSettingsForm.mockClear();
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
