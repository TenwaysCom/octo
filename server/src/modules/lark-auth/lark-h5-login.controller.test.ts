import { createLarkH5LoginController } from "./lark-h5-login.controller.js";

const origin = "https://octo.example.com";
const actionRunId = "12345678-1234-4234-8234-123456789abc";
const challengeId = "c".repeat(43);
const browserProof = "p".repeat(43);

describe("H5 login HTTP contract", () => {
  const setup = () => {
    const start = vi.fn().mockResolvedValue({ appId: "cli_test", challengeId, browserProof });
    const complete = vi.fn().mockResolvedValue({ ok: true, sessionToken: "opaque-session" });
    return { start, complete, controller: createLarkH5LoginController({ webOrigin: origin, baseUrl: "https://open.larksuite.com", start, complete }) };
  };
  it("issues a browser-only proof cookie and returns no proof in JSON", async () => {
    const { controller } = setup();
    const result = await controller.start({ origin, body: { actionRunId } });
    expect(result.statusCode).toBe(200);
    expect(result.cookies[0]).toContain("HttpOnly; SameSite=Lax; Secure");
    expect(JSON.stringify(result.body)).not.toContain(browserProof);
    expect(result.body).toMatchObject({ ok: true, data: { appId: "cli_test", challengeId, actionRunId } });
  });
  it("rejects foreign/missing origins and forged identity inputs before calling services", async () => {
    const { controller, start, complete } = setup();
    for (const badOrigin of [undefined, "https://evil.example", "null"]) {
      expect((await controller.start({ origin: badOrigin, body: { actionRunId } })).statusCode).toBe(403);
      expect((await controller.complete({ origin: badOrigin, body: { actionRunId, challengeId, code: "code" } })).statusCode).toBe(403);
    }
    expect((await controller.complete({ origin, cookieHeader: `octo_h5_login=${browserProof}`, body: { actionRunId, challengeId, code: "code", masterUserId: "forged" } })).statusCode).toBe(400);
    expect(start).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });
  it("requires proof and only delivers a session through HttpOnly cookie", async () => {
    const { controller, complete } = setup();
    const body = { actionRunId, challengeId, code: "one-time-code" };
    expect((await controller.complete({ origin, body })).statusCode).toBe(401);
    expect(complete).not.toHaveBeenCalled();
    const result = await controller.complete({ origin, body, cookieHeader: `octo_h5_login=${browserProof}` });
    expect(complete).toHaveBeenCalledWith({ ...body, browserProof });
    expect(result.cookies[0]).toContain("Max-Age=0");
    expect(result.cookies[1]).toContain("octo_web_session=opaque-session");
    expect(JSON.stringify(result.body)).not.toMatch(/opaque-session|one-time-code/);
  });
  it("normalizes service failure and clears proof", async () => {
    const { controller, complete } = setup();
    complete.mockRejectedValue(new Error("secret error"));
    const result = await controller.complete({ origin, cookieHeader: `octo_h5_login=${browserProof}`, body: { actionRunId, challengeId, code: "code" } });
    expect(result.statusCode).toBe(503);
    expect(JSON.stringify(result)).not.toContain("secret error");
    expect(result.cookies[0]).toContain("Max-Age=0");
  });
});
