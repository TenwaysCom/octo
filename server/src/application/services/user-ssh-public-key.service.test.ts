import { UserSshPublicKeyService, UserSshPublicKeyServiceError } from "./user-ssh-public-key.service.js";

const publicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH octo@host";

describe("UserSshPublicKeyService", () => {
  it("normalizes an SSH public key and binds it to the server-resolved user", async () => {
    const store = {
      getActiveByPublicKeyFingerprint: vi.fn(),
      listForMasterUser: vi.fn(),
      createForMasterUser: vi.fn().mockImplementation(async (input) => ({ ...input, createdAt: "2026-08-14T00:00:00.000Z" })),
    };
    const service = new UserSshPublicKeyService(store);

    await expect(service.register({ masterUserId: "usr_1", publicKey: `  ${publicKey.replaceAll(" ", "\t")}  `, label: "  办公电脑  " })).resolves.toMatchObject({
      masterUserId: "usr_1",
      publicKey,
      label: "办公电脑",
      publicKeyFingerprint: "SHA256:vaFtoqR78PmmsE06FLndG8DO/PazyV19x+9o1q0JLLU",
      status: "active",
    });
    expect(store.createForMasterUser).toHaveBeenCalledWith(expect.objectContaining({
      masterUserId: "usr_1",
      publicKey,
      label: "办公电脑",
      publicKeyFingerprint: "SHA256:vaFtoqR78PmmsE06FLndG8DO/PazyV19x+9o1q0JLLU",
      status: "active",
    }));
  });

  it("rejects malformed and already-registered SSH public keys", async () => {
    const store = {
      getActiveByPublicKeyFingerprint: vi.fn(),
      listForMasterUser: vi.fn(),
      createForMasterUser: vi.fn().mockResolvedValue(undefined),
    };
    const service = new UserSshPublicKeyService(store);

    await expect(service.register({ masterUserId: "usr_1", publicKey: "not-a-public-key" }))
      .rejects.toMatchObject({ code: "SSH_PUBLIC_KEY_INVALID" } satisfies Partial<UserSshPublicKeyServiceError>);
    await expect(service.register({ masterUserId: "usr_1", publicKey }))
      .rejects.toMatchObject({ code: "SSH_PUBLIC_KEY_ALREADY_REGISTERED" } satisfies Partial<UserSshPublicKeyServiceError>);
  });
});
