import { vi } from "vitest";
import type { LarkContactRecord, LarkContactStore } from "../../adapters/lark/contact-store.js";
import type { LarkContactEmailLookupClient } from "../../adapters/lark/contact-client.js";
import { resolveLarkContactsByEmails } from "./lark-contact-resolver.service.js";

class MemoryLarkContactStore implements LarkContactStore {
  readonly records = new Map<string, LarkContactRecord>();
  readonly upserts: Array<{
    openId: string;
    email?: string | null;
    name?: string | null;
    meegleUserKey?: string | null;
  }> = [];

  async getByOpenId(openId: string): Promise<LarkContactRecord | undefined> {
    return this.records.get(openId);
  }

  async getByEmail(email: string): Promise<LarkContactRecord | undefined> {
    return Array.from(this.records.values()).find((record) => record.email === email);
  }

  async getByMeegleUserKey(meegleUserKey: string): Promise<LarkContactRecord | undefined> {
    return Array.from(this.records.values()).find((record) => record.meegleUserKey === meegleUserKey);
  }

  async upsert(input: {
    openId: string;
    email?: string | null;
    name?: string | null;
    meegleUserKey?: string | null;
  }): Promise<LarkContactRecord> {
    this.upserts.push(input);
    const now = "2026-06-22T00:00:00.000Z";
    const record = {
      openId: input.openId,
      email: input.email ?? null,
      name: input.name ?? null,
      meegleUserKey: input.meegleUserKey ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(input.openId, record);
    return record;
  }
}

describe("resolveLarkContactsByEmails", () => {
  it("uses cached contacts first, looks up misses from Lark, and stores resolved open ids", async () => {
    const store = new MemoryLarkContactStore();
    store.records.set("ou_cached", {
      openId: "ou_cached",
      email: "cached@example.com",
      name: "Cached User",
      meegleUserKey: null,
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
    });

    const lookupClient: LarkContactEmailLookupClient = {
      getUserIdsByEmails: vi.fn().mockResolvedValue([
        { openId: "ou_api", email: "api@example.com", name: null },
      ]),
    };

    await expect(
      resolveLarkContactsByEmails({
        emails: ["cached@example.com", "api@example.com", "cached@example.com"],
        store,
        lookupClient,
        meegleUsers: [
          { userKey: "meegle_cached", email: "cached@example.com", name: "Cached User" },
          { userKey: "meegle_api", email: "api@example.com", name: "Api User" },
        ],
      }),
    ).resolves.toEqual([
      { email: "cached@example.com", openId: "ou_cached", name: "Cached User" },
      { email: "api@example.com", openId: "ou_api", name: null },
    ]);

    expect(lookupClient.getUserIdsByEmails).toHaveBeenCalledWith({
      emails: ["api@example.com"],
    });
    expect(store.upserts).toEqual([
      {
        openId: "ou_cached",
        email: "cached@example.com",
        name: "Cached User",
        meegleUserKey: "meegle_cached",
      },
      {
        openId: "ou_api",
        email: "api@example.com",
        name: null,
        meegleUserKey: "meegle_api",
      },
    ]);
  });

  it("resolves cached contacts by Meegle user key before falling back to email lookup", async () => {
    const store = new MemoryLarkContactStore();
    store.records.set("ou_keyed", {
      openId: "ou_keyed",
      email: null,
      name: "Keyed User",
      meegleUserKey: "meegle_keyed",
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
    });

    const lookupClient: LarkContactEmailLookupClient = {
      getUserIdsByEmails: vi.fn().mockResolvedValue([]),
    };

    await expect(
      resolveLarkContactsByEmails({
        emails: [],
        store,
        lookupClient,
        meegleUsers: [
          { userKey: "meegle_keyed", email: null, name: "Keyed User" },
        ],
      }),
    ).resolves.toEqual([
      { email: null, openId: "ou_keyed", name: "Keyed User" },
    ]);

    expect(lookupClient.getUserIdsByEmails).not.toHaveBeenCalled();
    expect(store.upserts).toEqual([]);
  });
});
