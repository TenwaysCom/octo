import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthCodeFromMeegleApi } from "./meegle.js";

describe("meegle content script auth code fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the current page origin and returns an auth code", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { code: "auth_code_123" },
      }),
    } as Response);

    await expect(
      getAuthCodeFromMeegleApi(
        "PLUGIN_123",
        "state_123",
        "https://tenant.meegle.com",
      ),
    ).resolves.toMatchObject({
      authCode: "auth_code_123",
      state: "state_123",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://tenant.meegle.com/bff/v2/authen/v1/auth_code",
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });

  it("returns null when the API reports an auth error", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        error: { code: 401, msg: "login required" },
      }),
    } as Response);

    await expect(
      getAuthCodeFromMeegleApi(
        "PLUGIN_123",
        "state_123",
        "https://tenant.meegle.com",
      ),
    ).resolves.toBeNull();
  });
});
