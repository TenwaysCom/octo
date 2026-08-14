import { createTestPostgresDatabase } from "./test-db.js";
import { PostgresUserSshPublicKeyStore } from "./user-ssh-public-key-store.js";

describe("PostgresUserSshPublicKeyStore", () => {
  it("returns only active keys bound to an active user", async () => {
    const { db } = await createTestPostgresDatabase();
    await db.insertInto("users").values({
      id: "usr_1", status: "active", lark_tenant_key: null, lark_id: null, lark_email: null,
      lark_name: null, lark_avatar_url: null, meegle_base_url: null, meegle_user_key: null, github_id: null, role: null,
      created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z",
    }).execute();
    await db.insertInto("user_ssh_public_keys").values({
      id: "ssh_1", master_user_id: "usr_1", public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey support-qa",
      public_key_fingerprint: "SHA256:supportQaKey",
      status: "active", created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z",
    }).execute();
    const store = new PostgresUserSshPublicKeyStore(db);

    await expect(store.getActiveByPublicKeyFingerprint("SHA256:supportQaKey")).resolves.toEqual({
      id: "ssh_1",
      masterUserId: "usr_1",
      publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey support-qa",
      publicKeyFingerprint: "SHA256:supportQaKey",
      status: "active",
      createdAt: "2026-08-14T00:00:00.000Z",
    });
  });

  it("lists a user's keys and rejects a duplicate fingerprint globally", async () => {
    const { db } = await createTestPostgresDatabase();
    const store = new PostgresUserSshPublicKeyStore(db);
    const input = {
      id: "ssh_1",
      masterUserId: "usr_1",
      publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey octo@host",
      publicKeyFingerprint: "SHA256:keyOne",
      status: "active",
    };

    await expect(store.createForMasterUser(input)).resolves.toMatchObject(input);
    await expect(store.listForMasterUser("usr_1")).resolves.toMatchObject([input]);
    await expect(store.createForMasterUser({ ...input, id: "ssh_2", masterUserId: "usr_2" })).resolves.toBeUndefined();
  });

  it("does not authorize revoked keys", async () => {
    const { db } = await createTestPostgresDatabase();
    await db.insertInto("users").values({
      id: "usr_1", status: "active", lark_tenant_key: null, lark_id: null, lark_email: null,
      lark_name: null, lark_avatar_url: null, meegle_base_url: null, meegle_user_key: null, github_id: null, role: null,
      created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z",
    }).execute();
    await db.insertInto("user_ssh_public_keys").values({
      id: "ssh_revoked", master_user_id: "usr_1", public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey revoked-key",
      public_key_fingerprint: "SHA256:revokedKey",
      status: "revoked", created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z",
    }).execute();

    await expect(new PostgresUserSshPublicKeyStore(db).getActiveByPublicKeyFingerprint("SHA256:revokedKey")).resolves.toBeUndefined();
  });

  it("does not authorize an active key bound to an inactive user", async () => {
    const { db } = await createTestPostgresDatabase();
    await db.insertInto("users").values({
      id: "usr_conflict", status: "conflict", lark_tenant_key: null, lark_id: null, lark_email: null,
      lark_name: null, lark_avatar_url: null, meegle_base_url: null, meegle_user_key: null, github_id: null, role: null,
      created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z",
    }).execute();
    await db.insertInto("user_ssh_public_keys").values({
      id: "ssh_conflict", master_user_id: "usr_conflict", public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey conflict-user-key",
      public_key_fingerprint: "SHA256:inactiveUserKey",
      status: "active", created_at: "2026-08-14T00:00:00.000Z", updated_at: "2026-08-14T00:00:00.000Z",
    }).execute();

    await expect(new PostgresUserSshPublicKeyStore(db).getActiveByPublicKeyFingerprint("SHA256:inactiveUserKey")).resolves.toBeUndefined();
  });
});
