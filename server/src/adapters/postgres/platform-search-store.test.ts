import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresPlatformSyncStore } from "./platform-sync-store.js";
import { PostgresPlatformSearchStore } from "./platform-search-store.js";

describe("platform snapshot search", () => {
  it("searches all three kinds, ranks exact numbers, paginates and preserves literal wildcard characters", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    try {
      const sync = new PostgresPlatformSyncStore(db);
      const store = new PostgresPlatformSearchStore(db);
      await sync.upsertLarkBaseTicket({ baseId: "base", tableId: "table", record: { record_id: "rec-1", fields: {} }, title: "Checkout 50%_off", status: "Open" });
      await sync.applyLarkBaseTicketCleaning({ baseId: "base", tableId: "table", recordId: "rec-1", ticketNumber: "142", requester: "Ada, Bob", responsible: "Ann", issueType: "Bug" });
      await sync.upsertMeegleWorkitem({ projectKey: "project", workItemTypeKey: "story", workitem: { id: "900", key: "S-42", name: "Checkout order", type: "story", status: "In Progress", fields: {} } });
      await sync.upsertGitHubPullRequest({ owner: "acme", repo: "app", pullRequest: { number: 42, title: "Checkout fix", body: "", updated_at: "2026-09-01T00:00:00Z", draft: false, html_url: "https://github.com/acme/app/pull/42", state: "closed", merged_at: "2026-09-01T00:00:00Z" } });
      const search = (query: string, limit = 20, offset = 0) => store.search({ query, limit, offset });
      const all = await search("cHeCkOuT");
      expect(all).toHaveLength(3);
      for (const kind of ["lark-tickets", "meegle-workitems", "github-pull-requests"] as const) {
        expect(await store.search({ query: "checkout", limit: 1, offset: 0, kind })).toEqual([expect.objectContaining({ kind })]);
        expect(await store.search({ query: "checkout", limit: 1, offset: 1, kind })).toEqual([]);
      }
      expect(all.find((row) => row.kind === "github-pull-requests")).toMatchObject({ number: "42", status: "merged", scope: "acme/app" });
      expect(await search("42", 1)).toEqual([expect.objectContaining({ kind: "github-pull-requests", number: "42" })]);
      expect(await search("42", 2, 1)).toHaveLength(2);
      expect(await search("#42", 1)).toEqual([expect.objectContaining({ number: "42" })]);
      expect(await search("s-42")).toEqual([expect.objectContaining({ kind: "meegle-workitems", number: "S-42" })]);
      expect(await search("900")).toHaveLength(1);
      expect(await search("%_off")).toEqual([expect.objectContaining({ kind: "lark-tickets" })]);
      expect(await search("' OR 1=1 --")).toEqual([]);
      expect(await search("missing")).toEqual([]);
      expect(all.every((row) => !("fields_json" in row))).toBe(true);
      expect(await store.listTicketFilterOptions()).toEqual({ requester: ["Ada", "Bob"], responsible: ["Ann"], issueType: ["Bug"] });
    } finally { await db.destroy(); await pool.end(); }
  });

  it("combines ticket search and whole-person filters before pagination and count", async () => {
    const { db, pool } = await createTestPostgresDatabase();
    try {
      const store = new PostgresPlatformSyncStore(db);
      for (const [id, title, requester, responsible] of [
        ["1", "订单 Checkout", "Ada, Bob", "Ann"],
        ["2", "订单 checkout", "Bob", "Anna"],
        ["3", "Other", "Ada", "Ann"],
      ]) {
        await store.upsertLarkBaseTicket({ baseId: "base", tableId: "table", record: { record_id: id, fields: {} }, title, status: "Open" });
        await store.applyLarkBaseTicketCleaning({ baseId: "base", tableId: "table", recordId: id, ticketNumber: `10${id}`, requester, responsible, issueType: "Bug" });
      }
      const filters = { query: "CHECKOUT", requesters: ["Ada", "Bob"], responsibles: ["Ann"], issueTypes: ["Bug"] };
      expect(await store.listLarkBaseTickets(1, filters)).toEqual([expect.objectContaining({ recordId: "1" })]);
      expect(await store.countLarkBaseTickets(filters)).toBe(1);
      expect(await store.listLarkBaseTickets(1, { ...filters, offset: 1 })).toEqual([]);
      expect(await store.listLarkBaseTickets(1, { query: "#102" })).toEqual([expect.objectContaining({ recordId: "2" })]);
      expect(await store.countLarkBaseTickets({ query: "订单" })).toBe(2);
      expect(await store.countLarkBaseTickets({ requesters: ["Ad"] })).toBe(0);
      expect(await store.countLarkBaseTickets({ requesters: [".*"] })).toBe(0);
    } finally { await db.destroy(); await pool.end(); }
  });
});
