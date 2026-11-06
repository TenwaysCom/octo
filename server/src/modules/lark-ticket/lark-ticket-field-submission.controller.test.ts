import { createTicketFieldSubmissionController } from "./lark-ticket-field-submission.controller.js";
const session = { ok: true, masterUserId: "user", baseUrl: "https://open.larksuite.com", role: "pm", user: {} };
const payload = { baseId: "base", tableId: "table", expectedUserId: "user", submissionId: "a2c55ced-71da-4145-ad62-ce9ed9c9a363", actionRunId: "run", changes: [{ field: "priority", value: "P3", expected: { value: "P1" } }] };
function fixture(auth = session) {
  const service = { submit: vi.fn().mockResolvedValue({ state: "saved" }), get: vi.fn().mockResolvedValue({}),
    reconcile: vi.fn().mockResolvedValue({}), retrySync: vi.fn().mockResolvedValue({}), snapshot: vi.fn().mockResolvedValue({}) };
  const resolveSession = vi.fn().mockResolvedValue(auth);
  return { service, controller: createTicketFieldSubmissionController({ service, resolveSession }) };
}
describe("Ticket field submission controller", () => {
  it("validates a batch and derives identity solely from the session", async () => {
    const f = fixture();
    expect(await f.controller("submit", { recordId: "record", payload })).toMatchObject({ statusCode: 200, body: { ok: true } });
    expect(f.service.submit).toHaveBeenCalledWith({ ...payload, recordId: "record", masterUserId: "user", larkBaseUrl: session.baseUrl });
  });
  it.each([
    { ...payload, changes: [] }, { ...payload, changes: [...payload.changes, ...payload.changes] },
    { ...payload, changes: [{ field: "solution", value: "x", expected: { value: "old" } }] },
    { ...payload, changes: [{ field: "responsible", value: "Ada", expected: { value: "" } }] },
    { ...payload, changes: [{ field: "priority", value: "P1" }] },
    { ...payload, masterUserId: "forged" }, { ...payload, submissionId: "bad" },
  ])("rejects malformed or expanded requests (%#)", async (request) => {
    const f = fixture();
    expect(await f.controller("submit", { recordId: "record", payload: request })).toMatchObject({ statusCode: 400, body: { error: { layer: "server", actionRunId: "run", errorCode: "INVALID_REQUEST" } } });
    expect(f.service.submit).not.toHaveBeenCalled();
  });
  it("refuses a stale account even if the browser cookie switched between edits and dispatch", async () => {
    const f = fixture({ ...session, masterUserId: "different" });
    expect(await f.controller("submit", { recordId: "record", payload })).toMatchObject({ statusCode: 409, body: { error: { errorCode: "TICKET_ACCOUNT_CHANGED" } } });
    expect(f.service.submit).not.toHaveBeenCalled();
  });
  it.each(["get", "reconcile", "retrySync", "snapshot", "submit"] as const)("protects %s with platformSync permission", async (operation) => {
    const f = fixture({ ...session, role: "dev" });
    expect(await f.controller(operation, { recordId: "record", payload })).toMatchObject({ statusCode: 403 });
    for (const fn of Object.values(f.service)) expect(fn).not.toHaveBeenCalled();
  });
  it("requires a logged-in session", async () => {
    const f = fixture({ ok: false, errorCode: "UNAUTHENTICATED", errorMessage: "login" } as never);
    expect(await f.controller("submit", { recordId: "record", payload })).toMatchObject({ statusCode: 401 });
  });
});
