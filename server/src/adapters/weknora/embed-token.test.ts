import { vi } from "vitest";
import { exchangeWeKnoraEmbedToken } from "./embed-token.js";

describe("WeKnora exchange adapter", () => {
  it("sends a server-only credential and validates the short token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { session_token: "short", expires_in: 1800, secret: "discard" } })));
    expect(await exchangeWeKnoraEmbedToken({ publishToken: "private", origin: "https://octo.example" }, { fetch: fetchMock })).toEqual({ token: "short", expiresIn: 1800 });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/6410a037-6485-4408-8173-4b0c498a0426/exchange"), expect.objectContaining({ method: "POST", redirect: "error", signal: expect.any(AbortSignal), headers: { Authorization: "Embed private", Origin: "https://octo.example" } }));
  });
  it.each([
    [403, '{"data":{"session_token":"short","expires_in":1800}}'],
    [200, 'not json'], [200, '{}'],
    [200, '{"data":{"session_token":"","expires_in":1800}}'],
    [200, '{"data":{"session_token":"short","expires_in":0}}'],
  ])("rejects bad status or response %s %s", async (status, body) => {
    await expect(exchangeWeKnoraEmbedToken({ publishToken: "private", origin: "https://octo.example" }, { fetch: vi.fn().mockResolvedValue(new Response(body, { status })) })).rejects.toThrow();
  });
  it("propagates transport failure to the sanitized controller boundary", async () => {
    await expect(exchangeWeKnoraEmbedToken({ publishToken: "private", origin: "https://octo.example" }, { fetch: vi.fn().mockRejectedValue(new Error("timeout")) })).rejects.toThrow("timeout");
  });
});
