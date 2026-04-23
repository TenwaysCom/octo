import { describe, expect, it } from "vitest";
import {
  DEFAULT_LARK_AUTH_BASE_URL,
  resolvePlatformUrl,
} from "./platform-url.js";

describe("platform url resolver", () => {
  it("maps meegle page aliases to the canonical auth base", () => {
    expect(
      resolvePlatformUrl("https://meegle.com/work_item/123", {
        meegleAuthBaseUrl: "https://project.larksuite.com",
      }),
    ).toEqual({
      platform: "meegle",
      authBaseUrl: "https://project.larksuite.com",
      pageOrigin: "https://meegle.com",
    });
  });

  it("maps lark page aliases to the canonical auth base", () => {
    expect(
      resolvePlatformUrl("https://foo.feishu.cn/base/abc", {
        meegleAuthBaseUrl: "https://project.larksuite.com",
      }),
    ).toEqual({
      platform: "lark",
      authBaseUrl: DEFAULT_LARK_AUTH_BASE_URL,
      pageOrigin: "https://foo.feishu.cn",
    });

    expect(
      resolvePlatformUrl("https://www.larksuite.com/wiki/xyz", {
        meegleAuthBaseUrl: "https://project.larksuite.com",
      }),
    ).toEqual({
      platform: "lark",
      authBaseUrl: DEFAULT_LARK_AUTH_BASE_URL,
      pageOrigin: "https://www.larksuite.com",
    });
  });

  it("recognizes GitHub pull request pages", () => {
    expect(
      resolvePlatformUrl("https://github.com/tenways/tw-itdog/pull/123", {
        meegleAuthBaseUrl: "https://project.larksuite.com",
      }),
    ).toEqual({
      platform: "github",
      authBaseUrl: null,
      pageOrigin: "https://github.com",
    });
  });

  it("marks unrelated pages as unsupported", () => {
    expect(
      resolvePlatformUrl("https://github.com/tenways/tw-itdog", {
        meegleAuthBaseUrl: "https://project.larksuite.com",
      }),
    ).toEqual({
      platform: "unsupported",
      authBaseUrl: null,
      pageOrigin: "https://github.com",
    });
  });
});
