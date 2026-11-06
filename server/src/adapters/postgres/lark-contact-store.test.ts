import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresLarkContactStore } from "./lark-contact-store.js";
import { ensureLarkContactAvatarColumns } from "./database.js";

describe("PostgresLarkContactStore", () => {
  it("adds avatar columns idempotently and incrementally merges avatars without changing contact identity fields", async () => {
    const { db } = await createTestPostgresDatabase();
    try {
      await ensureLarkContactAvatarColumns(db);
      await ensureLarkContactAvatarColumns(db);
      const store = new PostgresLarkContactStore(db);
      const existing = await store.upsert({ openId: "ou_alice", name: "Alice", email: "alice@example.com", meegleUserKey: "meegle_alice" });
      const now = "2026-11-06T00:00:00.000Z";
      const input = { openId: "ou_alice", avatarUrl: "https://example.com/new.png", sourceSyncedAt: "2026-11-05T00:00:00.000Z" };
      expect(await store.upsertAvatars([input, { ...input, openId: "ou_bob" }], now)).toBe(2);
      expect(await store.getByOpenId("ou_alice")).toMatchObject({ name: "Alice", email: "alice@example.com", meegleUserKey: "meegle_alice", createdAt: existing.createdAt, avatarUrl: input.avatarUrl, avatarSourceSyncedAt: input.sourceSyncedAt });
      expect(await store.getByOpenId("ou_bob")).toMatchObject({ email: null, name: null, meegleUserKey: null, avatarUrl: input.avatarUrl });
      expect(await store.listAvatarsByOpenIds(["ou_alice", "ou_alice", "ou_missing"])).toEqual([{ openId: "ou_alice", avatarUrl: input.avatarUrl }]);
      expect(await store.listAvatarsByOpenIds([])).toEqual([]);
      // pg-mem returns the existing row even when ON CONFLICT's WHERE is false.
      // Assert persisted state here; real PostgreSQL checks verify no-op counts.
      await store.upsertAvatars([input], "2026-11-07T00:00:00.000Z");
      await store.upsertAvatars([{ ...input, avatarUrl: "https://example.com/old.png", sourceSyncedAt: "2026-11-01T00:00:00.000Z" }], "2026-11-07T00:00:00.000Z");
      await store.upsertAvatars([{ ...input, avatarUrl: "https://example.com/tie.png" }], "2026-11-07T00:00:00.000Z");
      expect(await store.getByOpenId("ou_alice")).toMatchObject({ updatedAt: now, avatarUrl: input.avatarUrl, avatarSourceSyncedAt: input.sourceSyncedAt });
      expect(await store.upsertAvatars([{ ...input, sourceSyncedAt: "2026-11-06T00:00:00.000Z", avatarUrl: "https://example.com/newest.png" }], now)).toBe(1);
      // Normal directory refreshes leave independently extracted avatar data intact.
      expect(await store.upsert({ openId: "ou_alice", name: "Alice updated", email: "alice@example.com" }))
        .toMatchObject({ avatarUrl: "https://example.com/newest.png", avatarSourceSyncedAt: "2026-11-06T00:00:00.000Z", meegleUserKey: "meegle_alice" });
      expect(await db.selectFrom("lark_contacts").select("open_id").execute()).toHaveLength(2);
    } finally { await db.destroy(); }
  });

  it("selects only the requested Base/Table and time interval including its start but excluding its end", async () => {
    const { db } = await createTestPostgresDatabase();
    try {
      const store = new PostgresLarkContactStore(db);
      for (const [recordId, createdTime, baseId, tableId] of [
        ["before", "2026-10-31T23:59:59.999Z", "base", "table"],
        ["start", "2026-11-01T08:00:00+08:00", "base", "table"],
        ["end", "2026-11-02T00:00:00.000Z", "base", "table"],
        ["other-base", "2026-11-01T00:00:00.000Z", "other", "table"],
        ["other-table", "2026-11-01T00:00:00.000Z", "base", "other"],
      ]) {
        await db.insertInto("lark_base_ticket_syncs").values({ base_id: baseId, table_id: tableId, record_id: recordId, title: recordId, fields_json: "{}", created_time: createdTime, source_updated_at: null, synced_at: "2026-11-03T00:00:00.000Z" }).execute();
      }
      const range = { baseId: "base", tableId: "table", startTime: "2026-11-01T00:00:00.000Z", endTime: "2026-11-02T00:00:00.000Z", timeField: "created_time" as const };
      expect((await store.listTicketAvatarSources(range)).map((row) => row.recordId)).toEqual(["start"]);
      expect(await store.listTicketAvatarSources({ ...range, timeField: "source_updated_at" })).toEqual([]);
      expect(await store.listTicketAvatarSources({ ...range, timeField: "synced_at", startTime: "2026-11-03T00:00:00.000Z", endTime: "2026-11-04T00:00:00.000Z" })).toHaveLength(3);
    } finally { await db.destroy(); }
  });

  it("upserts and looks up contacts by open id and email", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresLarkContactStore(db);

    await store.upsert({
      openId: "ou_mike",
      email: "mike.huang@tenways.com",
      name: "Mike Huang",
      meegleUserKey: "meegle_mike",
    });

    await expect(store.getByOpenId("ou_mike")).resolves.toMatchObject({
      openId: "ou_mike",
      email: "mike.huang@tenways.com",
      name: "Mike Huang",
      meegleUserKey: "meegle_mike",
    });
    await expect(store.getByEmail("mike.huang@tenways.com")).resolves.toMatchObject({
      openId: "ou_mike",
      email: "mike.huang@tenways.com",
      name: "Mike Huang",
      meegleUserKey: "meegle_mike",
    });
    await expect(store.getByMeegleUserKey("meegle_mike")).resolves.toMatchObject({
      openId: "ou_mike",
      email: "mike.huang@tenways.com",
      name: "Mike Huang",
      meegleUserKey: "meegle_mike",
    });

    await store.upsert({
      openId: "ou_mike",
      email: "mike.new@tenways.com",
      name: "Mike H.",
      meegleUserKey: "meegle_mike_new",
    });

    await expect(store.getByOpenId("ou_mike")).resolves.toMatchObject({
      openId: "ou_mike",
      email: "mike.new@tenways.com",
      name: "Mike H.",
      meegleUserKey: "meegle_mike_new",
    });
    await expect(store.getByMeegleUserKey("meegle_mike_new")).resolves.toMatchObject({
      openId: "ou_mike",
      email: "mike.new@tenways.com",
      name: "Mike H.",
      meegleUserKey: "meegle_mike_new",
    });
    await expect(store.getByEmail("mike.huang@tenways.com")).resolves.toBeUndefined();
  });
});
