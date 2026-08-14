import type { Kysely } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export interface UserSshPublicKeyRecord {
  keyId: string;
  masterUserId: string;
  publicKey: string;
}

export interface UserSshPublicKeyStore {
  getActiveByPublicKeyFingerprint(publicKeyFingerprint: string): Promise<UserSshPublicKeyRecord | undefined>;
}

export class PostgresUserSshPublicKeyStore implements UserSshPublicKeyStore {
  constructor(private readonly db: Kysely<DatabaseSchema> = getSharedDatabase()) {}

  async getActiveByPublicKeyFingerprint(publicKeyFingerprint: string): Promise<UserSshPublicKeyRecord | undefined> {
    const row = await this.db.selectFrom("user_ssh_public_keys as ssh")
      .innerJoin("users as user", "user.id", "ssh.master_user_id")
      .select(["ssh.key_id", "ssh.master_user_id", "ssh.public_key"])
      .where("ssh.public_key_fingerprint", "=", publicKeyFingerprint)
      .where("ssh.status", "=", "active")
      .where("user.status", "=", "active")
      .executeTakeFirst();
    if (!row) return undefined;
    return { keyId: row.key_id, masterUserId: row.master_user_id, publicKey: row.public_key };
  }
}
