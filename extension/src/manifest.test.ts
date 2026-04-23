import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("extension manifest", () => {
  it("injects the Meegle content script on both apex and subdomain Meegle hosts", () => {
    const manifestPath = path.resolve(import.meta.dirname, "../manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      host_permissions?: string[];
      content_scripts?: Array<{ matches?: string[] }>;
      web_accessible_resources?: Array<{ matches?: string[] }>;
    };

    expect(manifest.host_permissions).toContain("https://meegle.com/*");
    expect(manifest.host_permissions).toContain("https://*.meegle.com/*");

    const meegleContentScript = manifest.content_scripts?.find((entry) =>
      entry.matches?.includes("https://*.meegle.com/*") || entry.matches?.includes("https://meegle.com/*"),
    );

    expect(meegleContentScript?.matches).toContain("https://meegle.com/*");
    expect(meegleContentScript?.matches).toContain("https://*.meegle.com/*");

    const meegleWebResources = manifest.web_accessible_resources?.find((entry) =>
      entry.matches?.includes("https://*.meegle.com/*") || entry.matches?.includes("https://meegle.com/*"),
    );

    expect(meegleWebResources?.matches).toContain("https://meegle.com/*");
    expect(meegleWebResources?.matches).toContain("https://*.meegle.com/*");
  });

  it("injects the GitHub content script and exposes popup resources on github.com", () => {
    const manifestPath = path.resolve(import.meta.dirname, "../manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      host_permissions?: string[];
      content_scripts?: Array<{ matches?: string[] }>;
      web_accessible_resources?: Array<{ resources?: string[]; matches?: string[] }>;
    };

    expect(manifest.host_permissions).toContain("https://github.com/*");

    const githubContentScript = manifest.content_scripts?.find((entry) =>
      entry.matches?.includes("https://github.com/*"),
    );

    expect(githubContentScript?.matches).toContain("https://github.com/*");

    const githubIcons = manifest.web_accessible_resources?.find((entry) =>
      entry.resources?.includes("icons/*"),
    );
    const githubPopup = manifest.web_accessible_resources?.find((entry) =>
      entry.resources?.includes("popup.html"),
    );

    expect(githubIcons?.matches).toContain("https://github.com/*");
    expect(githubPopup?.matches).toContain("https://github.com/*");
  });

  it("uses a localhost match pattern without an explicit port for callback pages", () => {
    const manifestPath = path.resolve(import.meta.dirname, "../manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      host_permissions?: string[];
      content_scripts?: Array<{ matches?: string[] }>;
    };

    expect(manifest.host_permissions).toContain("http://localhost/*");
    expect(manifest.host_permissions).not.toContain("http://localhost:3000/*");

    const callbackContentScript = manifest.content_scripts?.find((entry) =>
      entry.matches?.includes("http://localhost/api/lark/auth/callback*"),
    );

    expect(callbackContentScript?.matches).toContain("http://localhost/api/lark/auth/callback*");
  });
});
