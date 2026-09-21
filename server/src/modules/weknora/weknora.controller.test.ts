import { vi } from "vitest";
import express from "express";
import { WeKnoraExchangeError } from "../../adapters/weknora/embed-token.js";
import { createServer } from "node:http";
import { createWeKnoraController, registerWeKnoraRoutes } from "./weknora.controller.js";
import { createApiAuthMiddleware } from "../../http/api-auth.js";

const identity = { ok: true as const, masterUserId: "user", baseUrl: "https://lark.example", user: {} };
const env = { WEKNORA_PUBLISH_TOKEN: "private-test-token", LARK_OAUTH_CALLBACK_URL: "https://octo.example/api/lark/auth/callback" };
function setup() {
  const resolveSession = vi.fn().mockResolvedValue(identity);
  const exchange = vi.fn().mockResolvedValue({ token: "short-test-token", expiresIn: 1800 });
  return { resolveSession, exchange, controller: createWeKnoraController({ resolveSession, exchange, env }) };
}
describe("WeKnora token controller", () => {
  it("validates the real session and only returns the short token", async () => {
    const { controller, resolveSession, exchange } = setup();
    const result = await controller({ cookieHeader: "other=x; octo_web_session=opaque%20session", query: {} });
    expect(resolveSession).toHaveBeenCalledWith("opaque session");
    expect(exchange).toHaveBeenCalledWith({ publishToken: "private-test-token", origin: "https://octo.example" });
    expect(result).toEqual({ statusCode: 200, body: { token: "short-test-token", expiresIn: 1800 } });
  });
  it.each([undefined, "session_id=fake", "octo_web_session=%ZZ", "octo_web_session=expired"])("rejects invalid sessions: %s", async (cookieHeader) => {
    const { controller, resolveSession, exchange } = setup();
    resolveSession.mockResolvedValue({ ok: false });
    expect((await controller({ cookieHeader, query: {} })).statusCode).toBe(401);
    expect(exchange).not.toHaveBeenCalled();
  });
  it("does not accept client overrides", async () => {
    const { controller, exchange } = setup();
    expect((await controller({ query: { origin: "https://evil.example" } })).statusCode).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
  });
  it("fails closed with missing configuration", async () => {
    const { resolveSession, exchange } = setup();
    expect((await createWeKnoraController({ resolveSession, exchange, env: {} })({ query: {} })).statusCode).toBe(503);
    expect(exchange).not.toHaveBeenCalled();
  });
  it("sanitizes upstream errors", async () => {
    const { controller, exchange } = setup();
    exchange.mockRejectedValue(new Error("secret upstream body"));
    const result = await controller({ query: {} });
    expect(result.statusCode).toBe(502);
    expect(JSON.stringify(result)).not.toContain("secret upstream body");
  });
  it("preserves safe exchange diagnostics for the API logger", async () => {
    const { controller, exchange } = setup();
    exchange.mockRejectedValue(new WeKnoraExchangeError("WEKNORA_ORIGIN_NOT_ALLOWED", 403));
    const result = await controller({ query: {} });
    expect(result).toMatchObject({ statusCode: 502, body: { error: {
      errorCode: "WEKNORA_ORIGIN_NOT_ALLOWED", rawStatusCode: 403, layer: "adapter", stage: "exchange",
    } } });
  });
  it("serves both routes without caching and never accepts a fake bearer", async () => {
    const app = express();
    app.use(createApiAuthMiddleware());
    registerWeKnoraRoutes(app, { resolveSession: vi.fn().mockResolvedValue({ ok: false }) });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address() as { port: number };
      for (const path of ["/weknora/embed-token", "/api/weknora/embed-token"]) {
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { headers: { Authorization: "Bearer fake" } });
        expect(response.status).toBe(401);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect((await response.json()).error.module).toBe("weknora");
      }
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
