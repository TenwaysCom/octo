// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { injectSidebar } from "./sidebar-injector";

describe("sidebar-injector", () => {
  it("renders trigger and panel inside shadow DOM", () => {
    const handle = injectSidebar();

    const host = document.getElementById("tenways-octo-sidebar-host");
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();

    const trigger = host?.shadowRoot?.querySelector(".octo-trigger");
    expect(trigger).not.toBeNull();

    const panel = host?.shadowRoot?.querySelector(".octo-sidebar-panel");
    expect(panel).not.toBeNull();

    const iframe = host?.shadowRoot?.querySelector(".octo-sidebar-iframe") as HTMLIFrameElement | null;
    expect(iframe?.getAttribute("src")).toBe("sidebar-popup.html");

    const backdrop = host?.shadowRoot?.querySelector(".octo-sidebar-backdrop");
    expect(backdrop).not.toBeNull();

    handle.destroy();
  });

  it("opens the sidebar when trigger is clicked", () => {
    const handle = injectSidebar();

    const host = document.getElementById("tenways-octo-sidebar-host");
    const trigger = host?.shadowRoot?.querySelector(".octo-trigger") as HTMLElement;
    const panel = host?.shadowRoot?.querySelector(".octo-sidebar-panel") as HTMLElement;
    const backdrop = host?.shadowRoot?.querySelector(".octo-sidebar-backdrop") as HTMLElement;

    expect(panel.classList.contains("open")).toBe(false);
    expect(backdrop.classList.contains("open")).toBe(false);

    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(panel.classList.contains("open")).toBe(true);
    expect(backdrop.classList.contains("open")).toBe(true);

    handle.destroy();
  });

  it("closes the sidebar when clicking the backdrop", () => {
    const handle = injectSidebar();
    handle.open();

    const host = document.getElementById("tenways-octo-sidebar-host");
    const backdrop = host?.shadowRoot?.querySelector(".octo-sidebar-backdrop") as HTMLElement;
    const panel = host?.shadowRoot?.querySelector(".octo-sidebar-panel") as HTMLElement;

    expect(panel.classList.contains("open")).toBe(true);

    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(panel.classList.contains("open")).toBe(false);
    expect(backdrop.classList.contains("open")).toBe(false);

    handle.destroy();
  });

  it("closes the sidebar when clicking the close button", () => {
    const handle = injectSidebar();
    handle.open();

    const host = document.getElementById("tenways-octo-sidebar-host");
    const closeBtn = host?.shadowRoot?.querySelector(".octo-sidebar-close") as HTMLElement;
    const panel = host?.shadowRoot?.querySelector(".octo-sidebar-panel") as HTMLElement;

    expect(panel.classList.contains("open")).toBe(true);

    closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(panel.classList.contains("open")).toBe(false);

    handle.destroy();
  });

  it("toggles the sidebar on multiple trigger clicks", () => {
    const handle = injectSidebar();

    const host = document.getElementById("tenways-octo-sidebar-host");
    const trigger = host?.shadowRoot?.querySelector(".octo-trigger") as HTMLElement;
    const panel = host?.shadowRoot?.querySelector(".octo-sidebar-panel") as HTMLElement;

    trigger.click();
    expect(panel.classList.contains("open")).toBe(true);

    trigger.click();
    expect(panel.classList.contains("open")).toBe(false);

    trigger.click();
    expect(panel.classList.contains("open")).toBe(true);

    handle.destroy();
  });

  it("cleans up DOM and event listeners on destroy", () => {
    const handle = injectSidebar();
    expect(document.getElementById("tenways-octo-sidebar-host")).not.toBeNull();

    handle.destroy();

    expect(document.getElementById("tenways-octo-sidebar-host")).toBeNull();
  });

  it("passes host context into the sidebar popup url when provided", () => {
    const handle = injectSidebar({
      hostPageType: "lark",
      hostUrl: "https://nsghpcq7ar4z.sg.larksuite.com/record/JfrhrMSAHeNRowcqTTclnyteg0c",
      hostOrigin: "https://nsghpcq7ar4z.sg.larksuite.com",
      larkUserId: "ou_sidebar_host",
    });

    const host = document.getElementById("tenways-octo-sidebar-host");
    const iframe = host?.shadowRoot?.querySelector(".octo-sidebar-iframe") as HTMLIFrameElement | null;
    const iframeUrl = iframe?.getAttribute("src");

    expect(iframeUrl).toContain("sidebar-popup.html?");
    expect(iframeUrl).toContain("hostPageType=lark");
    expect(iframeUrl).toContain("hostOrigin=https%3A%2F%2Fnsghpcq7ar4z.sg.larksuite.com");
    expect(iframeUrl).toContain("larkUserId=ou_sidebar_host");

    handle.destroy();
  });
});
