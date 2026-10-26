import { extractProfile, profileFingerprint, validateProfile, type ProfileInput, type ProfileOutput } from "./user-profile-extractor.js";

const input = (subjectKey = "fixture:A"): ProfileInput => ({
  subjectKey, accessScope: "fixture-only", methodVersion: "v3-draft", windowPolicy: "rolling-12-months-plus-open",
  tickets: [{ key: "T1", semanticVersion: "1" }, { key: "T2", semanticVersion: "1" }],
  evidence: [
    { id: "E1", ticketKey: "T1", kind: "message", role: "requester", text: "这次请给操作步骤", version: "1" },
    { id: "E2", ticketKey: "T2", kind: "message", role: "requester", text: "请发步骤清单", version: "1" },
  ], limitations: [],
});
const output = (): ProfileOutput => ({ claims: [{ id: "C1", kind: "communication", statement: "两次请求步骤说明", scope: "所提供历史工单", basis: "repeated", status: "supported", evidenceIds: ["E1", "E2"], counterEvidenceIds: [] }], limitations: [] });
const now = () => new Date("2026-09-27T12:00:00Z");
function deps(data = input(), result = output()) {
  return { input: data, client: { createJsonCompletion: vi.fn(async () => ({ content: JSON.stringify(result), model: "fixture" })) }, actionRunId: "fixture-run", now, readCurrentFingerprint: async () => profileFingerprint(data) };
}

describe("user profile extraction design contract", () => {
  it("reuses unchanged input without another call or changing generation time", async () => {
    const d = deps(); const first = await extractProfile(d);
    const second = await extractProfile({ ...d, previous: first.revision });
    expect(first.status).toBe("ready"); expect(second.status).toBe("unchanged");
    expect(d.client.createJsonCompletion).toHaveBeenCalledTimes(1);
    expect(second.revision).toEqual(first.revision);
  });
  it("hash is stable for order but changes for content, membership and scope", () => {
    const a = input(); const b = structuredClone(a); b.tickets.reverse(); b.evidence.reverse();
    expect(profileFingerprint(a)).toBe(profileFingerprint(b));
    b.evidence[0].text = "更正：我希望只给结论";
    expect(profileFingerprint(a)).not.toBe(profileFingerprint(b));
    expect(profileFingerprint(a)).not.toBe(profileFingerprint({ ...a, accessScope: "different" }));
    expect(profileFingerprint(a)).not.toBe(profileFingerprint({ ...a, tickets: [], evidence: [] }));
  });
  it("counts distinct tickets, not messages or repeated IDs", () => {
    const a = input(); a.evidence[1].ticketKey = "T1";
    expect(() => validateProfile(output(), a)).toThrow("PROFILE_REPETITION_UNSUPPORTED");
    const o = output(); o.claims[0].evidenceIds = ["E1", "E1"];
    expect(() => validateProfile(o, input())).toThrow("PROFILE_DUPLICATE_EVIDENCE");
  });
  it("rejects unknown references and Shadow-only preference attribution", () => {
    const o = output(); o.claims[0].evidenceIds.push("OTHER_USER");
    expect(() => validateProfile(o, input())).toThrow("PROFILE_REFERENCE_INVALID");
    const a = input(); a.evidence[0].kind = "shadow";
    expect(() => validateProfile(output(), a)).toThrow("PROFILE_ROLE_UNVERIFIED");
  });
  it("user A correction replaces old output and explicitly keeps contradictory evidence", async () => {
    const first = await extractProfile(deps());
    const a = input(); a.evidence.push({ id: "E3", ticketKey: "T2", kind: "message", role: "requester", text: "纠正：以后先给结论，需要时再给步骤", version: "2" });
    const o = output(); Object.assign(o.claims[0], { statement: "过去要求步骤，最新明确要求先给结论；需按场景判断", status: "conflicting", counterEvidenceIds: ["E3"] });
    const next = await extractProfile({ ...deps(a, o), previous: first.revision });
    expect(next.status).toBe("ready"); expect(next.revision?.output.claims[0].counterEvidenceIds).toEqual(["E3"]);
    expect(next.revision?.output.claims[0].statement).not.toBe(first.revision?.output.claims[0].statement);
  });
  it("user B with one ticket has no repeated preference; deletion revokes all claims without AI", async () => {
    const b = input("fixture:B"); b.tickets = b.tickets.slice(0, 1); b.evidence = b.evidence.slice(0, 1);
    const o: ProfileOutput = { claims: [], limitations: ["仅单次请求，不推断长期偏好"] };
    const first = await extractProfile(deps(b, o)); expect(first.status).toBe("ready");
    const d = deps({ ...b, tickets: [], evidence: [] });
    const next = await extractProfile({ ...d, previous: first.revision });
    expect(next.status).toBe("ready"); expect(next.revision?.output.claims).toEqual([]);
    expect(d.client.createJsonCompletion).not.toHaveBeenCalled();
  });
  it("removed or window-expired evidence cannot retain the old repeated claim", () => {
    const a = input(); a.tickets.pop(); a.evidence.pop();
    expect(() => validateProfile(output(), a)).toThrow("PROFILE_REFERENCE_INVALID");
  });
  it("does not reuse a profile from a different subject or permission scope", async () => {
    const first = await extractProfile(deps()); const d = deps(input("fixture:B"));
    const next = await extractProfile({ ...d, previous: first.revision });
    expect(next.revision?.subjectKey).toBe("fixture:B"); expect(d.client.createJsonCompletion).toHaveBeenCalledOnce();
  });
  it("does not publish results when sources change during generation", async () => {
    const first = await extractProfile(deps()); const d = deps(); d.input.evidence[0].version = "2";
    const next = await extractProfile({ ...d, previous: first.revision, readCurrentFingerprint: async () => "newer-source" });
    expect(next.status).toBe("superseded"); expect(next.revision).toBeUndefined();
  });
  it("preserves previous result on provider failure", async () => {
    const first = await extractProfile(deps()); const d = deps(); d.input.evidence[0].version = "2";
    d.client.createJsonCompletion.mockRejectedValueOnce(new Error("provider unavailable"));
    const next = await extractProfile({ ...d, previous: first.revision });
    expect(next.status).toBe("failed"); expect(next.revision).toEqual(first.revision);
  });
  it("withholds old claims when a source is removed and regeneration fails", async () => {
    const first = await extractProfile(deps()); const a = input();
    a.tickets.pop(); a.evidence.pop(); const d = deps(a);
    d.client.createJsonCompletion.mockRejectedValueOnce(new Error("provider unavailable"));
    const next = await extractProfile({ ...d, previous: first.revision });
    expect(next.status).toBe("failed"); expect(next.revision).toBeUndefined();
    expect(first.revision?.sourceTicketKeys).toEqual(["T1", "T2"]);
  });
  it("withholds cached output when the latest source fingerprint differs", async () => {
    const first = await extractProfile(deps()); const d = deps();
    const next = await extractProfile({ ...d, previous: first.revision, readCurrentFingerprint: async () => "changed-membership" });
    expect(next.status).toBe("superseded"); expect(next.revision).toBeUndefined();
    expect(d.client.createJsonCompletion).not.toHaveBeenCalled();
  });
  it("preserves limitations and requires conflict evidence", () => {
    const a = input(); a.limitations = ["线程不完整"];
    expect(validateProfile(output(), a).limitations).toContain("线程不完整");
    const o = output(); o.claims[0].status = "conflicting";
    expect(() => validateProfile(o, a)).toThrow("PROFILE_CONFLICT_INVALID");
  });
  it("rejects duplicate ticket membership and orphan evidence before model invocation", async () => {
    const a = input(); a.tickets.push(a.tickets[0]); const d = deps(a);
    await expect(extractProfile(d)).rejects.toThrow("PROFILE_INPUT_INVALID");
    expect(d.client.createJsonCompletion).not.toHaveBeenCalled();
    const b = input(); b.evidence[0].ticketKey = "OTHER_SUBJECT_TICKET";
    expect(() => validateProfile({ claims: [], limitations: [] }, b)).toThrow("PROFILE_INPUT_INVALID");
  });
  it("keeps old output on invalid model references and malformed JSON", async () => {
    const first = await extractProfile(deps()); const a = input(); a.evidence[0].version = "2";
    const o = output(); o.claims[0].evidenceIds = ["invented"];
    expect((await extractProfile({ ...deps(a, o), previous: first.revision })).revision).toEqual(first.revision);
    const d = deps(a); d.client.createJsonCompletion.mockResolvedValueOnce({ content: "not json", model: "fixture" });
    expect((await extractProfile({ ...d, previous: first.revision })).status).toBe("failed");
  });
  it("moving a ticket invalidates both subjects and does not merge their evidence", async () => {
    const a = input(); const b = input("fixture:B"); b.tickets = []; b.evidence = [];
    const oldA = profileFingerprint(a); const oldB = profileFingerprint(b);
    b.tickets.push(a.tickets.pop()!); b.evidence.push(a.evidence.pop()!);
    expect(profileFingerprint(a)).not.toBe(oldA); expect(profileFingerprint(b)).not.toBe(oldB);
    expect(() => validateProfile(output(), a)).toThrow("PROFILE_REFERENCE_INVALID");
    expect(() => validateProfile(output(), b)).toThrow("PROFILE_REFERENCE_INVALID");
  });
  it("accepts contextual personality observations backed by requester messages", () => {
    const a = input();
    a.evidence[0].text = "这两笔账的税额不同，我核对过行项目，请再确认舍入规则";
    a.evidence[1].text = "我逐项核对后发现总额差0.01，能否解释计算方式";
    const o = output(); o.claims[0].kind = "personality";
    o.claims[0].statement = "在金额核对场景多次主动检查明细并追问差异";
    o.claims[0].scope = "两次金额核对事件";
    expect(validateProfile(o, a).claims[0].kind).toBe("personality");
    a.evidence[1].role = "other";
    expect(() => validateProfile(o, a)).toThrow("PROFILE_ROLE_UNVERIFIED");
  });
  it("needs traits require primary evidence from each supporting ticket", () => {
    const a = input(); const o = output(); o.claims[0].kind = "needs";
    o.claims[0].statement = "两次提出减少重复录入";
    for (const e of a.evidence) { e.kind = "ticket_field"; e.role = "unknown"; e.text = "希望自动带出已有信息，避免重复填写"; }
    expect(validateProfile(o, a).claims[0].kind).toBe("needs");
    a.evidence[1].kind = "shadow";
    expect(() => validateProfile(o, a)).toThrow("PROFILE_REPETITION_UNSUPPORTED");
    a.evidence[0].kind = "shadow";
    expect(() => validateProfile(o, a)).toThrow("PROFILE_PRIMARY_EVIDENCE_REQUIRED");
  });
  it("rejects old service categories and unrequested extra output fields", () => {
    const o = output();
    expect(() => validateProfile({ ...o, claims: [{ ...o.claims[0], kind: "service_context" }] }, input())).toThrow();
    expect(() => validateProfile({ ...o, communicationDraft: "reply" }, input())).toThrow();
    expect(() => validateProfile({ ...o, claims: [{ ...o.claims[0], actionState: "executed" }] }, input())).toThrow();
  });
  it("does not return an obsolete method result when the new method fails", async () => {
    const first = await extractProfile(deps()); const d = deps();
    d.client.createJsonCompletion.mockRejectedValueOnce(new Error("provider unavailable"));
    const next = await extractProfile({ ...d, previous: { ...first.revision!, methodVersion: "v2-draft" } });
    expect(next.status).toBe("failed"); expect(next.revision).toBeUndefined();
    expect(d.client.createJsonCompletion).toHaveBeenCalledOnce();
  });
});
