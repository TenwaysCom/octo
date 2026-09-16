import { UserSshPublicKeyServiceError } from "../../application/services/user-ssh-public-key.service.js";
import { createWebUserSshPublicKeysController } from "./user-ssh-public-keys.controller.js";

const key = {
  id: "ssh_1",
  masterUserId: "usr_1",
  publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH octo@host",
  label: "办公电脑",
  publicKeyFingerprint: "SHA256:vaFtoqR78PmmsE06FLndG8DO/PazyV19x+9o1q0JLLU",
  status: "active",
  createdAt: "2026-08-14T00:00:00.000Z",
};

describe("web user SSH public keys controller", () => {
  it("lists only the server-resolved user's public keys without exposing database identifiers", async () => {
    const service = { list: vi.fn().mockResolvedValue([key]), register: vi.fn() };
    const controller = createWebUserSshPublicKeysController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, masterUserId: "usr_1", baseUrl: "https://open.larksuite.com", user: {} }),
    });

    await expect(controller.list({ cookieHeader: "octo_web_session=session_1" })).resolves.toEqual({
      statusCode: 200,
      body: {
        ok: true,
        data: { keys: [{ publicKey: key.publicKey, label: "办公电脑", publicKeyFingerprint: key.publicKeyFingerprint, status: "active", createdAt: key.createdAt }] },
      },
    });
    expect(service.list).toHaveBeenCalledWith("usr_1");
  });

  it("registers against the session user and returns a typed duplicate error", async () => {
    const service = { list: vi.fn(), register: vi.fn().mockResolvedValue(key) };
    const controller = createWebUserSshPublicKeysController({
      service,
      ensureSession: vi.fn().mockResolvedValue({ ok: true, masterUserId: "usr_1", baseUrl: "https://open.larksuite.com", user: {} }),
    });
    const body = { publicKey: key.publicKey, label: "办公电脑", actionRunId: "7a14aeec-8b94-4df2-9a58-1f7d2c2ab054" };

    await expect(controller.register({ cookieHeader: "octo_web_session=session_1", body })).resolves.toMatchObject({
      statusCode: 201,
      body: { ok: true, data: { key: { publicKey: key.publicKey }, actionRunId: body.actionRunId } },
    });
    expect(service.register).toHaveBeenCalledWith({ masterUserId: "usr_1", publicKey: key.publicKey, label: "办公电脑" });

    service.register.mockRejectedValueOnce(new UserSshPublicKeyServiceError("SSH_PUBLIC_KEY_ALREADY_REGISTERED"));
    await expect(controller.register({ cookieHeader: "octo_web_session=session_1", body })).resolves.toMatchObject({
      statusCode: 409,
      body: { ok: false, error: { errorCode: "SSH_PUBLIC_KEY_ALREADY_REGISTERED" } },
    });
  });

  it("requires an authenticated web session", async () => {
    const controller = createWebUserSshPublicKeysController({
      service: { list: vi.fn(), register: vi.fn() },
      ensureSession: vi.fn().mockResolvedValue({ ok: false, errorCode: "UNAUTHORIZED", errorMessage: "登录已失效。" }),
    });

    await expect(controller.list({ cookieHeader: undefined })).resolves.toMatchObject({
      statusCode: 401,
      body: { ok: false, error: { errorCode: "UNAUTHORIZED" } },
    });
  });
});
