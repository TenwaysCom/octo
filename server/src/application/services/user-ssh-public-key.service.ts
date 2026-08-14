import { randomUUID } from "node:crypto";
import {
  PostgresUserSshPublicKeyStore,
  type UserSshPublicKeyRecord,
  type UserSshPublicKeyStore,
} from "../../adapters/postgres/user-ssh-public-key-store.js";
import { getSshPublicKeyFingerprint } from "../../http/internal-signed-request-auth.js";

export class UserSshPublicKeyServiceError extends Error {
  constructor(readonly code: "SSH_PUBLIC_KEY_INVALID" | "SSH_PUBLIC_KEY_ALREADY_REGISTERED") {
    super(code === "SSH_PUBLIC_KEY_INVALID" ? "SSH public key is invalid." : "SSH public key is already registered.");
  }
}

export class UserSshPublicKeyService {
  constructor(private readonly store: UserSshPublicKeyStore = new PostgresUserSshPublicKeyStore()) {}

  async list(masterUserId: string): Promise<UserSshPublicKeyRecord[]> {
    return this.store.listForMasterUser(masterUserId);
  }

  async register(input: { masterUserId: string; publicKey: string }): Promise<UserSshPublicKeyRecord> {
    const publicKey = normalizePublicKey(input.publicKey);
    const publicKeyFingerprint = getSshPublicKeyFingerprint(publicKey);
    if (!publicKeyFingerprint) {
      throw new UserSshPublicKeyServiceError("SSH_PUBLIC_KEY_INVALID");
    }

    const record = await this.store.createForMasterUser({
      id: `ssh-${randomUUID()}`,
      masterUserId: input.masterUserId,
      publicKey,
      publicKeyFingerprint,
      status: "active",
    });
    if (!record) {
      throw new UserSshPublicKeyServiceError("SSH_PUBLIC_KEY_ALREADY_REGISTERED");
    }
    return record;
  }
}

function normalizePublicKey(value: string): string {
  return value.trim().replace(/[\t ]+/g, " ");
}
