import type { LarkContactRecord, LarkContactStore } from "../../adapters/lark/contact-store.js";
import type { LarkContactDirectoryClient } from "../../adapters/lark/contact-client.js";
import { syncLarkContacts } from "./lark-contact-sync.service.js";

class MemoryLarkContactStore implements LarkContactStore {
  readonly records = new Map<string, LarkContactRecord>();
  readonly upserts: Array<{ openId: string; email?: string | null; name?: string | null }> = [];

  constructor(private readonly events: string[] = []) {}

  async getByOpenId(openId: string): Promise<LarkContactRecord | undefined> {
    return this.records.get(openId);
  }

  async getByEmail(email: string): Promise<LarkContactRecord | undefined> {
    return Array.from(this.records.values()).find((record) => record.email === email);
  }

  async getByMeegleUserKey(meegleUserKey: string): Promise<LarkContactRecord | undefined> {
    return Array.from(this.records.values()).find((record) => record.meegleUserKey === meegleUserKey);
  }

  async upsert(input: { openId: string; email?: string | null; name?: string | null }): Promise<LarkContactRecord> {
    this.events.push(`upsert:${input.openId}`);
    this.upserts.push(input);
    const existing = this.records.get(input.openId);
    const record = {
      openId: input.openId,
      email: input.email ?? null,
      name: input.name ?? null,
      meegleUserKey: existing?.meegleUserKey ?? null,
      createdAt: existing?.createdAt ?? "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    };
    this.records.set(input.openId, record);
    return record;
  }
}

describe("lark-contact-sync.service", () => {
  it("loads all departments before merging all department users into contacts", async () => {
    const events: string[] = [];
    const store = new MemoryLarkContactStore(events);
    const departmentCalls: Array<{ departmentId: string; pageToken?: string }> = [];
    const userCalls: Array<{ departmentId: string; pageToken?: string }> = [];

    const client: LarkContactDirectoryClient = {
      async listChildDepartments(input) {
        events.push(`departments:${input.departmentId}:${input.pageToken ?? "first"}`);
        departmentCalls.push({
          departmentId: input.departmentId,
          pageToken: input.pageToken,
        });

        if (input.departmentId === "0" && input.pageToken === "departments-page-2") {
          return {
            departments: [{ openDepartmentId: "od_b", name: "Dept B" }],
            hasMore: false,
          };
        }

        if (input.departmentId === "od_a") {
          return {
            departments: [{ openDepartmentId: "od_a_child", name: "Dept A Child" }],
            hasMore: false,
          };
        }

        if (input.departmentId === "od_b" || input.departmentId === "od_a_child") {
          return {
            departments: [],
            hasMore: false,
          };
        }

        return {
          departments: [{ openDepartmentId: "od_a", name: "Dept A" }],
          hasMore: true,
          nextPageToken: "departments-page-2",
        };
      },
      async listUsersByDepartment(input) {
        events.push(`users:${input.departmentId}:${input.pageToken ?? "first"}`);
        userCalls.push({
          departmentId: input.departmentId,
          pageToken: input.pageToken,
        });

        if (input.departmentId === "0" && !input.pageToken) {
          return {
            users: [
              { openId: "ou_1", email: "one@example.com", name: "One" },
              { openId: "ou_2", email: "two@example.com", name: "Two" },
            ],
            hasMore: true,
            nextPageToken: "users-page-2",
          };
        }

        if (input.departmentId === "0" && input.pageToken === "users-page-2") {
          return {
            users: [{ openId: "", email: "missing-open-id@example.com", name: "Missing" }],
            hasMore: false,
          };
        }

        if (input.departmentId === "od_a") {
          return {
            users: [{ openId: "ou_2", email: "duplicate@example.com", name: "Duplicate" }],
            hasMore: false,
          };
        }

        if (input.departmentId === "od_a_child") {
          return {
            users: [{ openId: "ou_4", email: "four@example.com", name: "Four" }],
            hasMore: false,
          };
        }

        return {
          users: [{ openId: "ou_3", email: null, name: "Three" }],
          hasMore: false,
        };
      },
    };

    const result = await syncLarkContacts({ client, store });

    expect(departmentCalls).toEqual([
      { departmentId: "0", pageToken: undefined },
      { departmentId: "0", pageToken: "departments-page-2" },
      { departmentId: "od_a", pageToken: undefined },
      { departmentId: "od_b", pageToken: undefined },
      { departmentId: "od_a_child", pageToken: undefined },
    ]);
    expect(userCalls).toEqual([
      { departmentId: "0", pageToken: undefined },
      { departmentId: "0", pageToken: "users-page-2" },
      { departmentId: "od_a", pageToken: undefined },
      { departmentId: "od_b", pageToken: undefined },
      { departmentId: "od_a_child", pageToken: undefined },
    ]);
    expect(store.upserts).toEqual([
      { openId: "ou_1", email: "one@example.com", name: "One" },
      { openId: "ou_2", email: "two@example.com", name: "Two" },
      { openId: "ou_3", email: null, name: "Three" },
      { openId: "ou_4", email: "four@example.com", name: "Four" },
    ]);
    expect(events).toEqual([
      "departments:0:first",
      "departments:0:departments-page-2",
      "departments:od_a:first",
      "departments:od_b:first",
      "departments:od_a_child:first",
      "users:0:first",
      "users:0:users-page-2",
      "users:od_a:first",
      "users:od_b:first",
      "users:od_a_child:first",
      "upsert:ou_1",
      "upsert:ou_2",
      "upsert:ou_3",
      "upsert:ou_4",
    ]);
    expect(result).toEqual({
      departmentsScanned: 4,
      usersScanned: 6,
      contactsUpserted: 4,
      contactsSkipped: 1,
    });
  });

  it("can sync only the requested department without reading child departments", async () => {
    const store = new MemoryLarkContactStore();
    const client: LarkContactDirectoryClient = {
      async listChildDepartments() {
        throw new Error("should not list child departments");
      },
      async listUsersByDepartment(input) {
        expect(input.departmentId).toBe("od_limited");
        return {
          users: [{ openId: "ou_limited", email: "limited@example.com", name: "Limited" }],
          hasMore: false,
        };
      },
    };

    const result = await syncLarkContacts({
      client,
      store,
      rootDepartmentId: "od_limited",
      includeChildDepartments: false,
    });

    expect(store.upserts).toEqual([
      { openId: "ou_limited", email: "limited@example.com", name: "Limited" },
    ]);
    expect(result).toEqual({
      departmentsScanned: 1,
      usersScanned: 1,
      contactsUpserted: 1,
      contactsSkipped: 0,
    });
  });
});
