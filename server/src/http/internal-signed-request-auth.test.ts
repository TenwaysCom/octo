import {
  buildInternalSignedRequestMessage,
  createInternalSignedRequestAuth,
  getSshPublicKeyFingerprint,
  getSshSigPublicKeyFingerprint,
} from "./internal-signed-request-auth.js";

const now = new Date("2026-08-14T05:00:00.000Z").getTime();
const rawBody = Buffer.from('{"record_id":"rec_1","fields":{"AI分析状态":"已分析"}}');
function sshUint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

function sshString(value: Buffer | string): Buffer {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return Buffer.concat([sshUint32(bytes.length), bytes]);
}

const publicKeyBlob = Buffer.concat([
  sshString("ssh-ed25519"),
  sshString(Buffer.alloc(32, 7)),
]);

function sshSignatureHeader(publicKey: Buffer = publicKeyBlob): string {
  const payload = Buffer.concat([
    Buffer.from("SSHSIG"),
    sshUint32(1),
    sshString(publicKey),
    sshString("octo-ticket-ai"),
    sshString(Buffer.alloc(0)),
    sshString("sha512"),
    sshString(Buffer.from("signature")),
  ]);
  const armored = [
    "-----BEGIN SSH SIGNATURE-----",
    payload.toString("base64"),
    "-----END SSH SIGNATURE-----",
    "",
  ].join("\n");
  return Buffer.from(armored, "utf8").toString("base64");
}

const publicKeyFingerprint = getSshSigPublicKeyFingerprint(Buffer.from(sshSignatureHeader(), "base64"));
if (!publicKeyFingerprint) throw new Error("Invalid SSHSIG test fixture");

const config = {
  signatureNamespace: "octo-ticket-ai",
  method: "POST",
  path: "/api/internal/lark-ticket-ai",
  headerPrefix: "x-octo-ticket-ai",
  allowedCidrs: "10.0.0.0/8,192.168.1.0/24",
  resolveSigningKey: vi.fn().mockResolvedValue({ principalId: "usr_1", publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey support-qa" }),
  now: () => now,
};

function signedHeaders(overrides: Record<string, string> = {}) {
  return {
    "x-octo-ticket-ai-request-id": "139861b1-5c75-4a5b-bfae-8e604687dc91",
    "x-octo-ticket-ai-timestamp": String(Math.floor(now / 1000)),
    "x-octo-ticket-ai-signature": sshSignatureHeader(),
    ...overrides,
  };
}

describe("internal signed-request authentication", () => {
  it("calculates the same OpenSSH fingerprint for a one-line public key", () => {
    const encodedKey = publicKeyBlob.toString("base64");

    expect(getSshPublicKeyFingerprint(`ssh-ed25519 ${encodedKey} octo@host`)).toBe(publicKeyFingerprint);
    expect(getSshPublicKeyFingerprint(`ssh-ed25519 ${encodedKey}\nextra`)).toBeUndefined();
    expect(getSshPublicKeyFingerprint("ssh-ed25519 invalid-base64")).toBeUndefined();
  });

  it("identifies the signing key from the SSHSIG-embedded public key without a key-id header", async () => {
    const verifySignature = vi.fn().mockResolvedValue(true);
    const auth = createInternalSignedRequestAuth({ ...config, verifySignature });

    await expect(auth.authorize({
      remoteAddress: "::ffff:10.2.3.4",
      headers: signedHeaders(),
      rawBody,
    })).resolves.toEqual({ publicKeyFingerprint, principalId: "usr_1" });
    expect(config.resolveSigningKey).toHaveBeenCalledWith(publicKeyFingerprint);
    expect(verifySignature).toHaveBeenCalledWith({
      publicKeyFingerprint,
      publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey support-qa",
      signatureNamespace: "octo-ticket-ai",
      message: buildInternalSignedRequestMessage({
        method: "POST",
        path: "/api/internal/lark-ticket-ai",
        timestamp: String(Math.floor(now / 1000)),
        requestId: "139861b1-5c75-4a5b-bfae-8e604687dc91",
        rawBody,
      }),
      signature: Buffer.from(sshSignatureHeader(), "base64"),
    });
  });

  it("rejects source IPs outside configured internal ranges before signature verification", async () => {
    const verifySignature = vi.fn().mockResolvedValue(true);
    const auth = createInternalSignedRequestAuth({ ...config, verifySignature });

    await expect(auth.authorize({ remoteAddress: "203.0.113.7", headers: signedHeaders(), rawBody }))
      .rejects.toMatchObject({ code: "INTERNAL_REQUEST_SOURCE_IP_FORBIDDEN", statusCode: 403 });
    expect(verifySignature).not.toHaveBeenCalled();
  });

  it("rejects expired and replayed signed requests", async () => {
    const auth = createInternalSignedRequestAuth({ ...config, verifySignature: vi.fn().mockResolvedValue(true) });

    await expect(auth.authorize({
      remoteAddress: "10.2.3.4",
      headers: signedHeaders({ "x-octo-ticket-ai-timestamp": String(Math.floor(now / 1000) - 301) }),
      rawBody,
    })).rejects.toMatchObject({ code: "INTERNAL_REQUEST_EXPIRED", statusCode: 403 });

    const request = { remoteAddress: "10.2.3.4", headers: signedHeaders(), rawBody };
    await expect(auth.authorize(request)).resolves.toEqual({ publicKeyFingerprint, principalId: "usr_1" });
    await expect(auth.authorize(request)).rejects.toMatchObject({ code: "INTERNAL_REQUEST_REPLAYED", statusCode: 409 });
  });

  it("fails closed when its CIDR configuration is malformed", async () => {
    const auth = createInternalSignedRequestAuth({ ...config, allowedCidrs: "10.0.0.0/", verifySignature: vi.fn() });

    await expect(auth.authorize({ remoteAddress: "10.2.3.4", headers: signedHeaders(), rawBody }))
      .rejects.toMatchObject({ code: "INTERNAL_REQUEST_AUTH_NOT_CONFIGURED", statusCode: 503 });
  });

  it("rejects a signature public key that is not actively bound to a user", async () => {
    const auth = createInternalSignedRequestAuth({ ...config, resolveSigningKey: vi.fn().mockResolvedValue(undefined), verifySignature: vi.fn() });

    await expect(auth.authorize({ remoteAddress: "10.2.3.4", headers: signedHeaders(), rawBody }))
      .rejects.toMatchObject({ code: "INTERNAL_REQUEST_SIGNING_KEY_NOT_FOUND", statusCode: 403 });
  });
});
