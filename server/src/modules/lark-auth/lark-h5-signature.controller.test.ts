import { createLarkH5SignatureController, signLarkH5Url } from "./lark-h5-signature.controller.js";

const webOrigin = "https://octo.example.com";
const actionRunId = "12345678-1234-4234-8234-123456789abc";
const url = `${webOrigin}/?from=chat_action&bdp_launch_query=%7B%22__trigger_id__%22%3A%22secret%22%7D#lark-app`;
const setup = () => {
  const getTicket = vi.fn().mockResolvedValue("private-ticket");
  const ensureSession = vi.fn().mockResolvedValue({ ok: true, masterUserId: "usr_test", baseUrl: "https://open.larksuite.com", user: {} });
  return { getTicket, ensureSession, controller: createLarkH5SignatureController({ appId: "cli_test", webOrigin, getTicket, ensureSession, now: () => 1510045655000 }) };
};

describe("H5 signature endpoint", () => {
  it("hashes the documented exact input with SHA-1 (independently checked with Python hashlib)", () => {
    expect(signLarkH5Url("617bf955832a4d4d80d9d8d85917a427", "Y7a8KkqX041bsSwT", 1510045655000, "https://example.cn/test/1234/content.html"))
      .toBe("40a68999ecf7e05907edba43b31a50fd1830c777");
  });
  it("signs exact query bytes excluding hash, using fresh nonce and no ticket in response", async () => {
    const { controller } = setup();
    const input = { origin: webOrigin, cookieHeader: "octo_web_session=session", body: { url, actionRunId } };
    const first = await controller(input);
    const second = await controller(input);
    expect(first.body.ok).toBe(true);
    if (!first.body.ok || !second.body.ok) throw new Error("Expected signatures");
    const data = first.body.data;
    expect(data.timestamp).toBe(1510045655000);
    expect(data.signature).toBe(signLarkH5Url("private-ticket", data.nonceStr, data.timestamp, url.split("#")[0]));
    expect(data.nonceStr).not.toBe(second.body.data.nonceStr);
    expect(JSON.stringify(first)).not.toMatch(/private-ticket|__trigger_id__|session=/);
  });
  it("rejects anonymous sessions and foreign origins/URLs before fetching credentials", async () => {
    const { controller, ensureSession, getTicket } = setup();
    for (const denied of ["https://evil.example/", "https://octo.example.com.evil.example/", "https://name:password@octo.example.com/", "http://octo.example.com/"]) {
      expect((await controller({ origin: webOrigin, body: { url: denied, actionRunId } })).statusCode).toBe(403);
    }
    expect((await controller({ origin: "https://evil.example", body: { url, actionRunId } })).statusCode).toBe(403);
    expect(ensureSession).not.toHaveBeenCalled();
    ensureSession.mockResolvedValue({ ok: false, errorCode: "UNAUTHENTICATED" });
    expect((await controller({ origin: webOrigin, body: { url, actionRunId } })).statusCode).toBe(401);
    expect(getTicket).not.toHaveBeenCalled();
  });
  it("sanitizes provider failures", async () => {
    const { controller, getTicket } = setup();
    getTicket.mockRejectedValue(new Error("private-ticket"));
    const result = await controller({ origin: webOrigin, body: { url, actionRunId } });
    expect(result.statusCode).toBe(503);
    expect(JSON.stringify(result)).not.toContain("private-ticket");
  });
});
