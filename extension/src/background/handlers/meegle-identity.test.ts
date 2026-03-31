import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMeegleIdentityFromCookies } from "./meegle-identity.js";

describe("meegle identity cookie lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads user and tenant keys from chrome.cookies", async () => {
    vi.mocked(chrome.cookies.get).mockImplementation((...args) => {
      const [details, callback] = args as [
        chrome.cookies.Details,
        ((cookie: chrome.cookies.Cookie | null) => void)?,
      ];

      if (details.name === "meego_user_key") {
        callback?.({
          domain: "project.larksuite.com",
          name: "meego_user_key",
          path: "/",
          value: "7538275242901291040",
        } as chrome.cookies.Cookie);
        return undefined as never;
      }

      callback?.({
        domain: "project.larksuite.com",
        name: "meego_tenant_key",
        path: "/",
        value: "saas_7538275207677476895",
      } as chrome.cookies.Cookie);

      return undefined as never;
    });

    await expect(
      getMeegleIdentityFromCookies("https://project.larksuite.com/4c3fv6/overview"),
    ).resolves.toEqual({
      userKey: "7538275242901291040",
      tenantKey: "saas_7538275207677476895",
    });
  });

  it("returns undefined when no meegle user cookie is available", async () => {
    vi.mocked(chrome.cookies.get).mockImplementation((...args) => {
      const [, callback] = args as [
        chrome.cookies.Details,
        ((cookie: chrome.cookies.Cookie | null) => void)?,
      ];
      callback?.(null);
      return undefined as never;
    });

    await expect(
      getMeegleIdentityFromCookies("https://project.larksuite.com/4c3fv6/overview"),
    ).resolves.toBeUndefined();
  });
});
