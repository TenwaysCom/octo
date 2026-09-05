import type { Kysely } from "kysely";
import { getSharedDatabase } from "./database.js";
import type { DatabaseSchema } from "./schema.js";

export interface UserSshPublicKeyRecord {
  id: string;
  masterUserId: string;
  publicKey: string;
  label: string | null;
  publicKeyFingerprint: string;
  status: string;
  createdAt: string;
}

export interface UserSshPublicKeyStore {
  getActiveByPublicKeyFingerprint(publicKeyFingerprint: string): Promise<UserSshPublicKeyRecord | undefined>;
  listForMasterUser(masterUserId: string): Promise<UserSshPublicKeyRecord[]>;
  createForMasterUser(input: Omit<UserSshPublicKeyRecord, "createdAt">): Promise<UserSshPublicKeyRecord | undefined>;
}

export class PostgresUserSshPublicKeyStore implements UserSshPublicKeyStore {
  constructor(private readonly db: Kysely<DatabaseSchema> = getSharedDatabase()) {}

  async getActiveByPublicKeyFingerprint(publicKeyFingerprint: string): Promise<UserSshPublicKeyRecord | undefined> {
    const row = await this.db.selectFrom("user_ssh_public_keys as ssh")
      .innerJoin("users as user", "user.id", "ssh.master_user_id")
      .select(["ssh.id", "ssh.master_user_id", "ssh.public_key", "ssh.label", "ssh.public_key_fingerprint", "ssh.status", "ssh.created_at"])
      .where("ssh.public_key_fingerprint", "=", publicKeyFingerprint)
      .where("ssh.status", "=", "active")
      .where("user.status", "=", "active")
      .executeTakeFirst();
    if (!row) return undefined;
    return toRecord(row);
  }

  async listForMasterUser(masterUserId: string): Promise<UserSshPublicKeyRecord[]> {
    const rows = await this.db.selectFrom("user_ssh_public_keys")
      .select(["id", "master_user_id", "public_key", "label", "public_key_fingerprint", "status", "created_at"])
      .where("master_user_id", "=", masterUserId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.flatMap((row) => row.public_key_fingerprint ? [toRecord(row)] : []);
  }

  async createForMasterUser(input: Omit<UserSshPublicKeyRecord, "createdAt">): Promise<UserSshPublicKeyRecord | undefined> {
    const existing = await this.db.selectFrom("user_ssh_public_keys")
      .select("id")
      .where("public_key_fingerprint", "=", input.publicKeyFingerprint)
      .executeTakeFirst();
    if (existing) return undefined;

    const createdAt = new Date().toISOString();
    try {
      await this.db.insertInto("user_ssh_public_keys").values({
        id: input.id,
        master_user_id: input.masterUserId,
        public_key: input.publicKey,
        label: input.label,
        public_key_fingerprint: input.publicKeyFingerprint,
        status: input.status,
        created_at: createdAt,
        updated_at: createdAt,
      }).execute();
      return { ...input, createdAt };
    } catch (error) {
      if (isUniqueViolation(error)) return undefined;
      throw error;
    }
  }
}

function toRecord(row: {
  id: string;
  master_user_id: string;
  public_key: string;
  label: string | null;
  public_key_fingerprint: string | null;
  status: string;
  created_at: string;
}): UserSshPublicKeyRecord {
  if (!row.public_key_fingerprint) throw new Error("SSH public key fingerprint is missing");
  return {
    id: row.id,
    masterUserId: row.master_user_id,
    publicKey: row.public_key,
    label: row.label,
    publicKeyFingerprint: row.public_key_fingerprint,
    status: row.status,
    createdAt: row.created_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505")
    || error instanceof Error && /duplicate key|unique constraint/i.test(error.message);
}
