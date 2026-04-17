import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuthenticatedLarkClient } from "./lark-auth-client.factory.js";

describe("lark-auth-client.factory", () => {
  const getMock = vi.fn();
  const saveMock = vi.fn();
  const refreshLarkTokenMock = vi.fn();
  const createLarkClientMock = vi.fn();

  const deps = {
    getLarkTokenStore: () => ({
      get: getMock,
      save: saveMock,
      delete: vi.fn(),
    }),
    refreshLarkToken: refreshLarkTokenMock,
    createLarkClient: createLarkClientMock,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns client when token is not expired", async () => {
    getMock.mockResolvedValueOnce({
      masterUserId: "usr_123",
      tenantKey: "tenant_xxx",
      larkUserId: "lark_123",
      baseUrl: "https://open.larksuite.com",
      userToken: "token_123",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      refreshToken: "refresh_123",
      credentialStatus: "active",
    });
    createLarkClientMock.mockReturnValueOnce({} as ReturnType<typeof createLarkClientMock>);

    const result = await buildAuthenticatedLarkClient("usr_123", "https://open.larksuite.com", deps);

    expect(result.client).toBeDefined();
    expect(result.baseUrl).toBe("https://open.larksuite.com");
    expect(refreshLarkTokenMock).not.toHaveBeenCalled();
    expect(createLarkClientMock).toHaveBeenCalledWith("token_123", "https://open.larksuite.com");
  });

  it("refreshes token when expired and saves new token", async () => {
    const expiredAt = new Date(Date.now() - 1000).toISOString();
    getMock.mockResolvedValueOnce({
      masterUserId: "usr_123",
      tenantKey: "tenant_xxx",
      larkUserId: "lark_123",
      baseUrl: "https://open.larksuite.com",
      userToken: "old_token",
      userTokenExpiresAt: expiredAt,
      refreshToken: "refresh_123",
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      credentialStatus: "active",
    });
    refreshLarkTokenMock.mockResolvedValueOnce({
      accessToken: "new_token",
      refreshToken: "new_refresh",
      expiresIn: 7200,
    });
    createLarkClientMock.mockReturnValueOnce({} as ReturnType<typeof createLarkClientMock>);

    const result = await buildAuthenticatedLarkClient("usr_123", "https://open.larksuite.com", deps);

    expect(refreshLarkTokenMock).toHaveBeenCalledWith({
      masterUserId: "usr_123",
      baseUrl: "https://open.larksuite.com",
      refreshToken: "refresh_123",
    });
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userToken: "new_token",
        refreshToken: "new_refresh",
        credentialStatus: "active",
      }),
    );
    expect(createLarkClientMock).toHaveBeenCalledWith("new_token", "https://open.larksuite.com");
    expect(result.baseUrl).toBe("https://open.larksuite.com");
  });

  it("throws error when token not found", async () => {
    getMock.mockResolvedValueOnce(null);

    await expect(
      buildAuthenticatedLarkClient("usr_123", "https://open.larksuite.com", deps),
    ).rejects.toThrow("Lark token not found for user");
  });

  it("falls back to default LarkClient when createLarkClient dep is not provided", async () => {
    getMock.mockResolvedValueOnce({
      masterUserId: "usr_123",
      tenantKey: "tenant_xxx",
      larkUserId: "lark_123",
      baseUrl: "https://open.larksuite.com",
      userToken: "token_123",
      userTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      credentialStatus: "active",
    });

    const result = await buildAuthenticatedLarkClient("usr_123", "https://open.larksuite.com", {
      ...deps,
      createLarkClient: undefined,
    });

    expect(result.client).toBeDefined();
  });

  it("preserves refreshTokenExpiresAt when refreshing", async () => {
    const expiredAt = new Date(Date.now() - 1000).toISOString();
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    getMock.mockResolvedValueOnce({
      masterUserId: "usr_123",
      tenantKey: "tenant_xxx",
      larkUserId: "lark_123",
      baseUrl: "https://open.larksuite.com",
      userToken: "old_token",
      userTokenExpiresAt: expiredAt,
      refreshToken: "refresh_123",
      refreshTokenExpiresAt: refreshExpiresAt,
      credentialStatus: "active",
    });
    refreshLarkTokenMock.mockResolvedValueOnce({
      accessToken: "new_token",
      expiresIn: 7200,
    });
    createLarkClientMock.mockReturnValueOnce({} as ReturnType<typeof createLarkClientMock>);

    await buildAuthenticatedLarkClient("usr_123", "https://open.larksuite.com", deps);

    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshTokenExpiresAt: refreshExpiresAt,
      }),
    );
  });
});
