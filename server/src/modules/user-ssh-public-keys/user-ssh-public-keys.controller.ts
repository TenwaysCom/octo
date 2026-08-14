import { ZodError } from "zod";
import { UserSshPublicKeyService, UserSshPublicKeyServiceError } from "../../application/services/user-ssh-public-key.service.js";
import type { UserSshPublicKeyRecord } from "../../adapters/postgres/user-ssh-public-key-store.js";
import { logger } from "../../logger.js";
import { WEB_SESSION_COOKIE_NAME } from "../lark-auth/lark-auth.controller.js";
import { resolveLarkWebSessionIdentity } from "../lark-auth/lark-auth.service.js";
import { registerUserSshPublicKeySchema } from "./user-ssh-public-keys.dto.js";

type WebSessionResult = Awaited<ReturnType<typeof resolveLarkWebSessionIdentity>>;
const controllerLogger = logger.child({ module: "user-ssh-public-keys" });

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  const prefix = `${name}=`;
  const value = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!value) return undefined;
  try {
    return decodeURIComponent(value.slice(prefix.length));
  } catch {
    return undefined;
  }
}

function toWebKey(record: UserSshPublicKeyRecord) {
  return {
    publicKey: record.publicKey,
    publicKeyFingerprint: record.publicKeyFingerprint,
    status: record.status,
    createdAt: record.createdAt,
  };
}

function unauthorized(session: Extract<WebSessionResult, { ok: false }>) {
  return {
    statusCode: 401,
    body: { ok: false as const, error: { errorCode: session.errorCode, errorMessage: session.errorMessage } },
  };
}

export function createWebUserSshPublicKeysController(deps: {
  service?: Pick<UserSshPublicKeyService, "list" | "register">;
  ensureSession?: (sessionToken: string | undefined) => Promise<WebSessionResult>;
} = {}) {
  let service = deps.service;
  const getService = () => service ??= new UserSshPublicKeyService();
  const ensureSession = deps.ensureSession ?? resolveLarkWebSessionIdentity;

  async function sessionFor(cookieHeader: string | undefined) {
    return ensureSession(readCookie(cookieHeader, WEB_SESSION_COOKIE_NAME));
  }

  return {
    async list(input: { cookieHeader: string | undefined }) {
      const session = await sessionFor(input.cookieHeader);
      if (!session.ok) return unauthorized(session);
      try {
        const keys = await getService().list(session.masterUserId);
        return { statusCode: 200, body: { ok: true as const, data: { keys: keys.map(toWebKey) } } };
      } catch {
        return {
          statusCode: 502,
          body: { ok: false as const, error: { errorCode: "SSH_PUBLIC_KEYS_READ_FAILED", errorMessage: "无法读取 SSH 公钥。" } },
        };
      }
    },

    async register(input: { cookieHeader: string | undefined; body: unknown }) {
      const session = await sessionFor(input.cookieHeader);
      if (!session.ok) return unauthorized(session);
      try {
        const request = registerUserSshPublicKeySchema.parse(input.body);
        const key = await getService().register({ masterUserId: session.masterUserId, publicKey: request.publicKey });
        controllerLogger.info({
          actionRunId: request.actionRunId,
          masterUserId: session.masterUserId,
          publicKeyFingerprint: key.publicKeyFingerprint,
          layer: "server",
          module: "user-ssh-public-keys",
          stage: "server.ssh_public_key.registered",
        }, "USER_SSH_PUBLIC_KEY_REGISTERED");
        return { statusCode: 201, body: { ok: true as const, data: { key: toWebKey(key), actionRunId: request.actionRunId } } };
      } catch (error) {
        if (error instanceof ZodError) {
          return { statusCode: 400, body: { ok: false as const, error: { errorCode: "INVALID_REQUEST", errorMessage: error.message } } };
        }
        if (error instanceof UserSshPublicKeyServiceError) {
          const duplicate = error.code === "SSH_PUBLIC_KEY_ALREADY_REGISTERED";
          return {
            statusCode: duplicate ? 409 : 400,
            body: {
              ok: false as const,
              error: {
                errorCode: error.code,
                errorMessage: duplicate ? "该 SSH 公钥已被绑定。" : "SSH 公钥格式无效。",
              },
            },
          };
        }
        return {
          statusCode: 502,
          body: { ok: false as const, error: { errorCode: "SSH_PUBLIC_KEY_REGISTER_FAILED", errorMessage: "无法添加 SSH 公钥。" } },
        };
      }
    },
  };
}
