import { createLarkThreadTicketIntakeController } from "./lark-thread-ticket-intake.controller.js";
import type { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";

const body = { chatId: "oc_test", startTime: "2026-11-03T00:00:00+08:00", endTime: "2026-11-03T01:00:00+08:00", actionRunId: "request_1" };
const ensureSession = (role: string) => vi.fn().mockResolvedValue({ ok: true, masterUserId: "operator", role }) as unknown as typeof resolveLarkWebSessionIdentity;

describe("Lark thread intake range controller", () => {
  it("requires an opaque Web session and platformSync permission before scanning", async () => {
    const scanRange = vi.fn();
    const guest = createLarkThreadTicketIntakeController({ ensureSession: vi.fn().mockResolvedValue({ ok: false }), scanRange });
    expect(await guest({ body })).toMatchObject({ statusCode: 401, body: { error: { errorCode: "UNAUTHORIZED" } } });
    const developer = createLarkThreadTicketIntakeController({ ensureSession: ensureSession("dev"), scanRange });
    expect(await developer({ body })).toMatchObject({ statusCode: 403 });
    expect(scanRange).not.toHaveBeenCalled();
  });

  it("defaults to preview and preserves explicit offset timestamps and actionRunId", async () => {
    const scanRange = vi.fn().mockResolvedValue({ matched: 1, apply: false, results: [] });
    const session = vi.fn().mockResolvedValue({ ok: true, masterUserId: "operator", role: "pm" });
    const controller = createLarkThreadTicketIntakeController({ ensureSession: session, scanRange });
    expect(await controller({ body, cookieHeader: "octo_web_session=opaque%2Dsession" })).toMatchObject({ statusCode: 200, body: { ok: true } });
    expect(session).toHaveBeenCalledWith("opaque-session");
    expect(scanRange).toHaveBeenCalledWith({ ...body, apply: false, maxTickets: 5 });
  });

  it("generates a trace ID before scanning and preserves it on failure when none is supplied", async () => {
    const scanRange = vi.fn().mockRejectedValue(new Error("PLATFORM_PERMISSION_DENIED"));
    const controller = createLarkThreadTicketIntakeController({ ensureSession: ensureSession("pm"), scanRange });
    const result = await controller({ body: { ...body, actionRunId: undefined } });
    const requestId = scanRange.mock.calls[0][0].actionRunId;
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).toMatchObject({ statusCode: 502, body: { error: { actionRunId: requestId, errorCode: "PLATFORM_PERMISSION_DENIED" } } });
  });

  it.each(["  ", "x".repeat(129)])("returns a generated trace ID for invalid request IDs without scanning", async (actionRunId) => {
    const scanRange = vi.fn();
    const controller = createLarkThreadTicketIntakeController({ ensureSession: ensureSession("pm"), scanRange });
    const result = await controller({ body: { ...body, actionRunId } });
    expect(result).toMatchObject({ statusCode: 400, body: { error: { actionRunId: expect.stringMatching(/^[0-9a-f-]{36}$/), errorCode: "INVALID_REQUEST" } } });
    expect(scanRange).not.toHaveBeenCalled();
  });

  it("normalizes a supplied trace ID consistently for the scanner and failure response", async () => {
    const scanRange = vi.fn().mockRejectedValue(new Error("PLATFORM_PERMISSION_DENIED"));
    const controller = createLarkThreadTicketIntakeController({ ensureSession: ensureSession("pm"), scanRange });
    const result = await controller({ body: { ...body, actionRunId: " request_1 " } });
    expect(scanRange).toHaveBeenCalledWith(expect.objectContaining({ actionRunId: "request_1" }));
    expect(result).toMatchObject({ body: { error: { actionRunId: "request_1" } } });
  });

  it.each([
    { endTime: body.startTime }, { endTime: "yesterday" }, { startTime: "2026-11-02T23:00:00" },
    { maxTickets: 0 }, { maxTickets: 51 }, { apply: "true" }, { masterUserId: "forged" },
    { startTime: "2026-11-02T23:00:00.500Z" },
  ])("rejects malformed/reversed ranges and unauthorized request fields: %j", async (overrides) => {
    const scanRange = vi.fn();
    const controller = createLarkThreadTicketIntakeController({ ensureSession: ensureSession("admin"), scanRange });
    expect(await controller({ body: { ...body, ...overrides } })).toMatchObject({ statusCode: 400, body: { error: { errorCode: "INVALID_REQUEST", actionRunId: "request_1" } } });
    expect(scanRange).not.toHaveBeenCalled();
  });

  it("passes explicit apply and count limits, exposing per-ticket partial failures as data", async () => {
    const scanRange = vi.fn().mockResolvedValue({ apply: true, matched: 1, results: [{ status: "failed", recordId: "rec_created" }] });
    const controller = createLarkThreadTicketIntakeController({ ensureSession: ensureSession("devops"), scanRange });
    const result = await controller({ body: { ...body, apply: true, maxTickets: 1 } });
    expect(result).toMatchObject({ statusCode: 200, body: { data: { results: [{ status: "failed", recordId: "rec_created" }] } } });
    expect(scanRange).toHaveBeenCalledWith({ ...body, apply: true, maxTickets: 1 });
  });
});
