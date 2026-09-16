import { createAcpPermissionService } from "./acp-permission.service.js";
import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";
import type { AcpKimiStreamEvent } from "../../modules/acp-kimi/event-stream.js";

const params: RequestPermissionRequest = {
  sessionId: "native", toolCall: { toolCallId: "tool-1", title: "Inline script", rawInput: { command: "python -c 'print(1)'" } },
  options: [{ optionId: "once", kind: "allow_once", name: "Once" }, { optionId: "deny", kind: "reject_once", name: "Deny" }],
};
function fixture(mode: "interactive" | "background" = "interactive") {
  const service = createAcpPermissionService({ timeoutMs: 30 });
  const events: AcpKimiStreamEvent[] = [];
  const abort = new AbortController();
  const cancel = vi.fn(() => abort.abort());
  const run = service.beginRun({ operatorLarkId: "ou_1", sessionId: "public", agentSessionId: "native", actionRunId: "run", mode,
    emit: (event) => events.push(event), signal: abort.signal, cancel });
  const request = () => ({ operatorLarkId: "ou_1", sessionId: "public", actionRunId: "run", requestId: (events[0].data as { requestId: string }).requestId, optionId: "once" });
  return { service, events, run, request, cancel, abort };
}

describe("ACP permission runs", () => {
  it("requires the exact owner, public session, run and native option before allowing once", async () => {
    const test = fixture();
    const pending = test.run.request(params);
    for (const change of [{ operatorLarkId: "ou_other" }, { sessionId: "native" }, { actionRunId: "other" }]) {
      expect(() => test.service.reply({ ...test.request(), ...change })).toThrow("不属于");
    }
    expect(() => test.service.reply({ ...test.request(), optionId: "allow_always" })).toThrow("选项");
    test.service.reply(test.request());
    await expect(pending).resolves.toEqual({ outcome: { outcome: "selected", optionId: "once" } });
    expect(() => test.service.reply(test.request())).toThrow("已处理");
    expect(test.run.failure).toBeUndefined();
    test.run.close();
  });

  it.each(["reject", "expire", "cancel"])("cleans up a %s request and rejects a late reply", async (operation) => {
    const test = fixture();
    const pending = test.run.request(params);
    if (operation === "reject") test.service.reply({ ...test.request(), optionId: "deny" });
    if (operation === "cancel") test.abort.abort();
    await pending;
    expect(() => test.service.reply(test.request())).toThrow("已处理");
    if (operation !== "cancel") expect(test.run.failure?.code).toBe(operation === "reject" ? "ACP_PERMISSION_REJECTED" : "ACP_PERMISSION_EXPIRED");
    test.run.close();
  });

  it("cancels all concurrent requests on close", async () => {
    const test = fixture();
    const promises = [test.run.request(params), test.run.request(params)];
    test.run.close();
    expect(await Promise.all(promises)).toEqual([{ outcome: { outcome: "cancelled" } }, { outcome: { outcome: "cancelled" } }]);
  });

  it("rejects completion while an approval is still pending and clears the request", async () => {
    const test = fixture();
    const pending = test.run.request(params);
    expect(() => test.run.assertCompleted()).toThrow("审批结束前返回");
    await expect(pending).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    expect(test.run.failure?.code).toBe("ACP_PERMISSION_INCOMPLETE");
    expect(() => test.service.reply(test.request())).toThrow("已处理");
    test.run.close();
  });

  it("latches a permission configuration failure for a background run", async () => {
    const test = fixture("background");
    await expect(test.run.request(params)).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    expect(test.run.failure?.code).toBe("ACP_PERMISSION_CONFIGURATION_REQUIRED");
    expect(test.cancel).toHaveBeenCalledOnce();
    expect(test.events.every((event) => event.event !== "acp.permission.requested")).toBe(true);
    test.run.close();
  });

  it("fails a request for a different native session before showing any controls", async () => {
    const test = fixture();
    await test.run.request({ ...params, sessionId: "foreign" });
    expect(test.run.failure?.code).toBe("ACP_PERMISSION_SESSION_MISMATCH");
    expect(test.events).toEqual([]);
    test.run.close();
  });
});
