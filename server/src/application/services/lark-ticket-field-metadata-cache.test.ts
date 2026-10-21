import { LarkTicketFieldMetadataCache } from "./lark-ticket-field-metadata-cache.js";

describe("Ticket field metadata cache", () => {
  it("coalesces concurrent loads, expires after completion and isolates keys", async () => {
    let now = 0;
    const cache = new LarkTicketFieldMetadataCache(() => now, 100);
    const load = vi.fn().mockResolvedValue([{ field_name: "Status", field_id: "f1" }]);
    await Promise.all([cache.get("user1/table", load), cache.get("user1/table", load)]);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.get("user2/table", load);
    expect(load).toHaveBeenCalledTimes(2);
    now = 99;
    await cache.get("user1/table", load);
    expect(load).toHaveBeenCalledTimes(2);
    now = 100;
    await cache.get("user1/table", load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not cache failures, supports invalidation and bounds entries", async () => {
    const cache = new LarkTicketFieldMetadataCache(Date.now, 10000, 1);
    const load = vi.fn().mockRejectedValueOnce(new Error("DENIED")).mockResolvedValue([]);
    await expect(cache.get("a", load)).rejects.toThrow("DENIED");
    await cache.get("a", load);
    cache.invalidate("a");
    await cache.get("a", load);
    await cache.get("b", load);
    await cache.get("a", load);
    expect(load).toHaveBeenCalledTimes(5);
  });
});
