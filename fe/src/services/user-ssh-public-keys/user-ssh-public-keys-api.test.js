import assert from "node:assert/strict";
import test from "node:test";
import { listUserSshPublicKeys, registerUserSshPublicKey } from "./user-ssh-public-keys-api.js";

const key = {
  publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH octo@host",
  publicKeyFingerprint: "SHA256:vaFtoqR78PmmsE06FLndG8DO/PazyV19x+9o1q0JLLU",
  status: "active",
  createdAt: "2026-08-14T00:00:00.000Z",
};

test("loads the current user's SSH public keys with the browser session", async () => {
  let request;
  const result = await listUserSshPublicKeys({
    apiBaseUrl: "/api",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { keys: [key] } }) };
    },
  });

  assert.deepEqual(result, [key]);
  assert.equal(request.url, "/api/web/ssh-public-keys");
  assert.equal(request.options.credentials, "include");
});

test("registers an SSH public key and keeps duplicate errors typed", async () => {
  let request;
  const result = await registerUserSshPublicKey({
    apiBaseUrl: "/api",
    publicKey: key.publicKey,
    actionRunId: "7a14aeec-8b94-4df2-9a58-1f7d2c2ab054",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, data: { key } }) };
    },
  });

  assert.deepEqual(result, key);
  assert.equal(request.url, "/api/web/ssh-public-keys");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.credentials, "include");
  assert.deepEqual(JSON.parse(request.options.body), { publicKey: key.publicKey, actionRunId: "7a14aeec-8b94-4df2-9a58-1f7d2c2ab054" });

  await assert.rejects(
    () => registerUserSshPublicKey({
      apiBaseUrl: "/api",
      publicKey: key.publicKey,
      actionRunId: "7a14aeec-8b94-4df2-9a58-1f7d2c2ab054",
      fetchImpl: async () => ({ ok: false, json: async () => ({ ok: false, error: { errorCode: "SSH_PUBLIC_KEY_ALREADY_REGISTERED" } }) }),
    }),
    { code: "SSH_PUBLIC_KEY_ALREADY_REGISTERED" },
  );
});
