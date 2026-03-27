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
});
