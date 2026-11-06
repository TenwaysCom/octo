import { collectLarkTicketAvatars, extractLarkTicketAvatars } from "./lark-ticket-avatar-extraction.service.js";
import type { LarkTicketAvatarSource } from "../../adapters/postgres/lark-contact-store.js";

const source = (recordId: string, syncedAt: string, fields: unknown): LarkTicketAvatarSource => ({ recordId, syncedAt, fieldsJson: JSON.stringify(fields) });
const person = (id = "ou_alice", avatar_url = "https://example.com/avatar.png") => ({ id, avatar_url });

describe("Lark Ticket avatar extraction", () => {
  it("collects person arrays and single-person fields, deduplicates by open ID and keeps the newest valid observation", () => {
    const sources = [
      source("r2", "2026-11-02T00:00:00Z", { Responsible: [person("ou_alice", "https://example.com/new.png"), person("ou_bob")], 创建人: person("ou_creator") }),
      source("r1", "2026-11-01T00:00:00Z", { 需求人: [person()], Responsible: [person()] }),
      source("r3", "2026-11-03T00:00:00Z", { Responsible: [person("ou_alice", "")] }),
    ];
    const result = collectLarkTicketAvatars(sources);
    expect(result).toMatchObject({ scannedTickets: 3, avatarCandidates: 6, skippedAvatars: 1 });
    expect(result.avatars).toHaveLength(3);
    expect(result.avatars[0]).toEqual({ openId: "ou_alice", avatarUrl: "https://example.com/new.png", sourceSyncedAt: "2026-11-02T00:00:00.000Z" });
    // The same default avatar does not merge different people.
    expect(result.avatars.filter((avatar) => avatar.avatarUrl === "https://example.com/avatar.png")).toHaveLength(2);
    expect(collectLarkTicketAvatars([...sources].reverse())).toEqual(result);
  });

  it("rejects malformed JSON, missing observation times, unsupported IDs and unsafe or empty URLs", () => {
    const result = collectLarkTicketAvatars([
      { recordId: "bad-json", syncedAt: "2026-11-01T00:00:00Z", fieldsJson: "invalid" },
      source("bad-fields", "2026-11-01T00:00:00Z", []),
      source("bad-time", "invalid", { Responsible: [person()] }),
      source("people", "2026-11-01T00:00:00Z", { Responsible: [
        person("user_1"), person(""), { avatar_url: "https://example.com/a.png" },
        person("ou_script", "javascript:alert(1)"), person("ou_file", "file:///tmp/a.png"),
        person("ou_empty", ""), person("ou_http", "http://example.com/a.png"), null, "text",
        { id: "ou_bad_type", avatar_url: { toString: null } },
      ], Description: "avatar_url is just text", Attachment: [{ id: "file", url: "https://example.com/a.png" }] }),
    ]);
    expect(result).toMatchObject({ invalidFieldsJson: 2, invalidSourceTimes: 1, avatarCandidates: 8, skippedAvatars: 7 });
    expect(result.avatars.map((avatar) => avatar.openId)).toEqual(["ou_http"]);
  });

  it("chooses a stable winner when observations have the same time", () => {
    const sources = [
      source("b", "2026-11-01T08:00:00+08:00", { Responsible: [person("ou_alice", "https://example.com/b.png")] }),
      source("a", "2026-11-01T00:00:00Z", { Other: [person("ou_alice", "https://example.com/z.png"), person("ou_alice", "https://example.com/a.png")] }),
    ];
    expect(collectLarkTicketAvatars(sources).avatars[0].avatarUrl).toBe("https://example.com/a.png");
    expect(collectLarkTicketAvatars(sources).avatars).toEqual(collectLarkTicketAvatars([...sources].reverse()).avatars);
  });

  it("never writes during preview and returns only safe counts", async () => {
    const store = {
      listTicketAvatarSources: vi.fn().mockResolvedValue([source("r", "2026-11-01T00:00:00Z", { Responsible: [person()] })]),
      upsertAvatars: vi.fn().mockResolvedValue(1),
    };
    const request = { baseId: "base", tableId: "table", startTime: "2026-11-01T00:00:00Z", endTime: "2026-12-01T00:00:00Z", timeField: "created_time" as const, apply: false };
    const result = await extractLarkTicketAvatars(request, { store });
    expect(result).toMatchObject({ uniqueUsers: 1, written: 0 });
    expect(store.upsertAvatars).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/ou_alice|https:/);
    expect(await extractLarkTicketAvatars({ ...request, apply: true }, { store, now: () => new Date("2026-11-06T00:00:00Z") }))
      .toMatchObject({ uniqueUsers: 1, written: 1, unchangedOrOlder: 0 });
    expect(store.upsertAvatars).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ openId: "ou_alice" })]), "2026-11-06T00:00:00.000Z");
  });
});
