import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const MAX_SIGNATURE_BYTES = 64 * 1024;
const requestIdPattern = /^[A-Za-z0-9-]{16,128}$/;
const SSHSIG_MAGIC = Buffer.from("SSHSIG");
const SSHSIG_VERSION = 1;
const ALLOWED_SIGNER_ID = "octo-internal-request";

export class InternalSignedRequestAuthError extends Error {
  constructor(
    readonly code:
      | "INTERNAL_REQUEST_AUTH_NOT_CONFIGURED"
      | "INTERNAL_REQUEST_SOURCE_IP_FORBIDDEN"
      | "INTERNAL_REQUEST_SIGNING_KEY_NOT_FOUND"
      | "INTERNAL_REQUEST_SIGNATURE_INVALID"
      | "INTERNAL_REQUEST_EXPIRED"
      | "INTERNAL_REQUEST_REPLAYED"
      | "INTERNAL_REQUEST_SIGNATURE_VERIFIER_UNAVAILABLE",
    readonly statusCode: 403 | 409 | 503,
    message: string,
  ) {
    super(message);
  }
}

interface Cidr {
  network: number;
  mask: number;
}

export interface InternalSignedRequestAuthInput {
  remoteAddress: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer | undefined;
}

export interface InternalSignedRequestAuthDeps {
  signatureNamespace: string;
  method: string;
  path: string;
  headerPrefix: string;
  allowedCidrs?: string;
  resolveSigningKey?: (publicKeyFingerprint: string) => Promise<{ principalId: string; publicKey: string } | undefined>;
  now?: () => number;
  verifySignature?: (input: { publicKeyFingerprint: string; publicKey: string; signatureNamespace: string; message: string; signature: Buffer }) => Promise<boolean>;
}

function parseIpv4(value: string): number | undefined {
  const parts = value.split(".");
  if (parts.length !== 4) return undefined;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    result = ((result << 8) | octet) >>> 0;
  }
  return result;
}

function parseCidrs(value: string | undefined): Cidr[] | undefined {
  if (!value?.trim()) return undefined;
  const parsed = value.split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
    const parts = item.split("/");
    const [rawAddress, rawPrefix] = parts;
    const address = parseIpv4(rawAddress ?? "");
    if (parts.length > 2 || (rawPrefix !== undefined && !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(rawPrefix))) return undefined;
    const prefix = rawPrefix === undefined ? 32 : Number(rawPrefix);
    if (address === undefined) return undefined;
    const mask = prefix === 0 ? 0 : (0xffff_ffff << (32 - prefix)) >>> 0;
    return { network: (address & mask) >>> 0, mask };
  });
  return parsed.some((item) => !item) ? undefined : parsed as Cidr[];
}

function normalizeRemoteIpv4(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = value.startsWith("::ffff:") ? value.slice(7) : value;
  return parseIpv4(normalized);
}

export function isInternalSourceIpAllowed(remoteAddress: string | undefined, cidrs: Cidr[]): boolean {
  const address = normalizeRemoteIpv4(remoteAddress);
  return address !== undefined && cidrs.some(({ network, mask }) => (((address & mask) >>> 0) === network));
}

function readHeader(headers: InternalSignedRequestAuthInput["headers"], name: string): string | undefined {
  const value = headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim() : undefined;
}

function decodeSignature(value: string | undefined): Buffer | undefined {
  if (!value || value.length > MAX_SIGNATURE_BYTES * 2 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return undefined;
  const decoded = Buffer.from(value, "base64");
  return decoded.length > 0 && decoded.length <= MAX_SIGNATURE_BYTES ? decoded : undefined;
}

function readSshUint32(buffer: Buffer, offset: number): { value: number; nextOffset: number } | undefined {
  if (offset + 4 > buffer.length) return undefined;
  return { value: buffer.readUInt32BE(offset), nextOffset: offset + 4 };
}

function readSshString(buffer: Buffer, offset: number): { value: Buffer; nextOffset: number } | undefined {
  const length = readSshUint32(buffer, offset);
  if (!length || length.value > buffer.length - length.nextOffset) return undefined;
  return {
    value: buffer.subarray(length.nextOffset, length.nextOffset + length.value),
    nextOffset: length.nextOffset + length.value,
  };
}

function decodeArmoredSshSignature(signature: Buffer): Buffer | undefined {
  const text = signature.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(signature)) return undefined;
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
  if (lines.length < 3 || lines[0] !== "-----BEGIN SSH SIGNATURE-----" || lines.at(-1) !== "-----END SSH SIGNATURE-----") return undefined;
  const payload = lines.slice(1, -1).join("");
  if (!payload || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return undefined;
  const decoded = Buffer.from(payload, "base64");
  return decoded.length > 0 && decoded.toString("base64") === payload ? decoded : undefined;
}

export function getSshSigPublicKeyFingerprint(signature: Buffer): string | undefined {
  const payload = decodeArmoredSshSignature(signature);
  if (!payload || payload.length < SSHSIG_MAGIC.length + 4 || !payload.subarray(0, SSHSIG_MAGIC.length).equals(SSHSIG_MAGIC)) return undefined;
  const version = readSshUint32(payload, SSHSIG_MAGIC.length);
  if (!version || version.value !== SSHSIG_VERSION) return undefined;

  const publicKey = readSshString(payload, version.nextOffset);
  const namespace = publicKey && readSshString(payload, publicKey.nextOffset);
  const reserved = namespace && readSshString(payload, namespace.nextOffset);
  const hashAlgorithm = reserved && readSshString(payload, reserved.nextOffset);
  const rawSignature = hashAlgorithm && readSshString(payload, hashAlgorithm.nextOffset);
  if (!publicKey || !namespace || !reserved || !hashAlgorithm || !rawSignature
    || publicKey.value.length === 0 || namespace.value.length === 0 || hashAlgorithm.value.length === 0 || rawSignature.value.length === 0
    || rawSignature.nextOffset !== payload.length) return undefined;

  return `SHA256:${createHash("sha256").update(publicKey.value).digest("base64").replace(/=+$/, "")}`;
}

export function buildInternalSignedRequestMessage(input: {
  method: string;
  path: string;
  timestamp: string;
  requestId: string;
  rawBody: Buffer;
}): string {
  const bodyHash = createHash("sha256").update(input.rawBody).digest("hex");
  return [input.method.toUpperCase(), input.path, input.timestamp, input.requestId, bodyHash].join("\n");
}

async function verifySshSignature(input: {
  publicKey: string;
  signatureNamespace: string;
  message: string;
  signature: Buffer;
}): Promise<boolean> {
  const directory = await mkdtemp(join(tmpdir(), "octo-internal-signature-"));
  const signaturePath = join(directory, "request.sig");
  const allowedSignersPath = join(directory, "allowed_signers");
  try {
    if (/[\r\n]/.test(input.publicKey) || !input.publicKey.trim()) return false;
    await writeFile(signaturePath, input.signature, { mode: 0o600 });
    await writeFile(allowedSignersPath, `${ALLOWED_SIGNER_ID} ${input.publicKey.trim()}\n`, { mode: 0o600 });
    return await new Promise<boolean>((resolve, reject) => {
      const child = spawn("ssh-keygen", [
        "-Y", "verify",
        "-n", input.signatureNamespace,
        "-I", ALLOWED_SIGNER_ID,
        "-f", allowedSignersPath,
        "-s", signaturePath,
      ], { stdio: ["pipe", "ignore", "ignore"] });
      child.once("error", reject);
      child.once("close", (code) => resolve(code === 0));
      child.stdin.end(input.message, "utf8");
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function createInternalSignedRequestAuth(deps: InternalSignedRequestAuthDeps) {
  const cidrs = parseCidrs(deps.allowedCidrs);
  const now = deps.now ?? (() => Date.now());
  const verifySignature = deps.verifySignature ?? verifySshSignature;
  const header = (suffix: string) => `${deps.headerPrefix}-${suffix}`.toLowerCase();
  const seenRequests = new Map<string, number>();

  return {
    async authorize(input: InternalSignedRequestAuthInput): Promise<{ publicKeyFingerprint: string; principalId: string }> {
      if (!cidrs?.length || !deps.resolveSigningKey) {
        throw new InternalSignedRequestAuthError(
          "INTERNAL_REQUEST_AUTH_NOT_CONFIGURED",
          503,
          "Internal signed-request authentication is not configured.",
        );
      }
      if (!isInternalSourceIpAllowed(input.remoteAddress, cidrs)) {
        throw new InternalSignedRequestAuthError(
          "INTERNAL_REQUEST_SOURCE_IP_FORBIDDEN",
          403,
          "Source IP is not allowed for this internal API.",
        );
      }
      const requestId = readHeader(input.headers, header("request-id"));
      const timestamp = readHeader(input.headers, header("timestamp"));
      const signature = decodeSignature(readHeader(input.headers, header("signature")));
      const publicKeyFingerprint = signature && getSshSigPublicKeyFingerprint(signature);
      const timestampSeconds = Number(timestamp);
      if (!requestId || !requestIdPattern.test(requestId) || !timestamp || !Number.isInteger(timestampSeconds) || !signature || !publicKeyFingerprint || !input.rawBody) {
        throw new InternalSignedRequestAuthError("INTERNAL_REQUEST_SIGNATURE_INVALID", 403, "Internal request signature is invalid.");
      }
      if (Math.abs(now() - timestampSeconds * 1000) > MAX_CLOCK_SKEW_SECONDS * 1000) {
        throw new InternalSignedRequestAuthError("INTERNAL_REQUEST_EXPIRED", 403, "Internal request timestamp is outside the allowed window.");
      }
      for (const [requestKey, expiresAt] of seenRequests) {
        if (expiresAt <= now()) seenRequests.delete(requestKey);
      }
      const replayKey = `${publicKeyFingerprint}:${requestId}`;
      if (seenRequests.has(replayKey)) {
        throw new InternalSignedRequestAuthError("INTERNAL_REQUEST_REPLAYED", 409, "Internal request has already been processed.");
      }
      const signingKey = await deps.resolveSigningKey(publicKeyFingerprint);
      if (!signingKey) {
        throw new InternalSignedRequestAuthError("INTERNAL_REQUEST_SIGNING_KEY_NOT_FOUND", 403, "Signing key is not active for a user.");
      }
      let verified: boolean;
      try {
        verified = await verifySignature({
          publicKeyFingerprint,
          publicKey: signingKey.publicKey,
          signatureNamespace: deps.signatureNamespace,
          message: buildInternalSignedRequestMessage({
            method: deps.method,
            path: deps.path,
            timestamp,
            requestId,
            rawBody: input.rawBody,
          }),
          signature,
        });
      } catch {
        throw new InternalSignedRequestAuthError(
          "INTERNAL_REQUEST_SIGNATURE_VERIFIER_UNAVAILABLE",
          503,
          "Internal request signature verifier is unavailable.",
        );
      }
      if (!verified) {
        throw new InternalSignedRequestAuthError("INTERNAL_REQUEST_SIGNATURE_INVALID", 403, "Internal request signature is invalid.");
      }
      seenRequests.set(replayKey, now() + MAX_CLOCK_SKEW_SECONDS * 1000);
      return { publicKeyFingerprint, principalId: signingKey.principalId };
    },
  };
}
