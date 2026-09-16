import { describe, expect, it } from "vitest";
import { createSqliteDatabase } from "./database.js";
import { SqliteLarkContactStore } from "./lark-contact-store.js";

describe("SqliteLarkContactStore", () => {
  it("upserts and looks up contacts by open id and email", async () => {
    const db = createSqliteDatabase(":memory:");
    const store = new SqliteLarkContactStore(db);

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
