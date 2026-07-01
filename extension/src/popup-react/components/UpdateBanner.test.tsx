// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpdateBanner } from "./UpdateBanner";

describe("UpdateBanner", () => {
  const baseUpdate = {
    hasUpdate: true,
    currentVersion: "1.0.0",
    latestVersion: "1.1.0",
    releaseNotes: "Bug fixes and improvements",
    downloadUrl: "https://example.com/update.zip",
    forceUpdate: false,
    ignoredVersion: null,
    dismissedAt: null,
  };

  it("renders version info", () => {
    render(<UpdateBanner update={baseUpdate} onDownload={() => {}} onIgnore={() => {}} />);

    expect(screen.getByText("🎉 新版本 1.1.0 可用")).toBeTruthy();
    expect(screen.getByText("当前版本: 1.0.0 → 新版本: 1.1.0")).toBeTruthy();
    expect(screen.getByText("Bug fixes and improvements")).toBeTruthy();
  });

  it("calls onDownload when primary button is clicked", () => {
    const onDownload = vi.fn();
    render(<UpdateBanner update={baseUpdate} onDownload={onDownload} onIgnore={() => {}} />);

    fireEvent.click(screen.getByText("立即更新"));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("calls onIgnore when secondary button is clicked", () => {
    const onIgnore = vi.fn();
    render(<UpdateBanner update={baseUpdate} onDownload={() => {}} onIgnore={onIgnore} />);

    fireEvent.click(screen.getByText("忽略此版本"));
    expect(onIgnore).toHaveBeenCalledTimes(1);
  });

  it("does not render release notes when empty", () => {
    const updateWithoutNotes = { ...baseUpdate, releaseNotes: "" };
    render(<UpdateBanner update={updateWithoutNotes} onDownload={() => {}} onIgnore={() => {}} />);

    expect(screen.queryByText("Bug fixes and improvements")).toBeNull();
  });
});
