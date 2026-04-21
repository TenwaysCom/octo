// @vitest-environment jsdom

import React from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const initialize = vi.fn().mockResolvedValue(undefined);

vi.mock("./hooks/usePopupApp.js", () => ({
  usePopupApp: () => ({
    initialize,
  }),
}));

vi.mock("./PopupAppView.js", () => ({
  PopupAppView: () => React.createElement("div", { "data-test": "popup-app-view" }),
}));

import App from "./App.js";

describe("popup-react App", () => {
  beforeEach(() => {
    initialize.mockClear();
  });

  it("runs initialize on mount", async () => {
    render(React.createElement(App));

    await waitFor(() => {
      expect(initialize).toHaveBeenCalledTimes(1);
    });
  });

  it("does not run initialize twice under StrictMode", async () => {
    render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(App),
      ),
    );

    await waitFor(() => {
      expect(initialize).toHaveBeenCalledTimes(1);
    });
  });
});
