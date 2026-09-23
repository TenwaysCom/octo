import { createHash } from "node:crypto";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import { PostgresOauthSessionStore } from "../../adapters/postgres/lark-oauth-session-store.js";
import { PostgresWebSessionStore } from "../../adapters/postgres/web-session-store.js";
import { PostgresResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import { PostgresLarkTokenStore } from "../../adapters/postgres/lark-token-store.js";
import { startLarkH5Login, completeLarkH5Login, getLarkWebProfile, type LarkAuthServiceDeps } from "./lark-auth.service.js";

const baseUrl = "https://open.larksuite.com";
const actionRunId = "12345678-1234-4234-8234-123456789abc";

describe("H5 login identity and session", () => {
  async function setup(identity: Record<string, unknown> = { open_id: "ou_current", tenant_key: "tenant_a", name: "Current user" }) {
    const { db } = await createTestPostgresDatabase();
    const resolvedUserStore = new PostgresResolvedUserStore(db);
    const oauthSessionStore = new PostgresOauthSessionStore(db);
    const tokenStore = new PostgresLarkTokenStore(db);
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/app_access_token/internal")) return Response.json({ code: 0, app_access_token: "app-token" });
      if (url.endsWith("/authen/v1/access_token")) return Response.json({ code: 0, data: { access_token: "login-only-token" } });
      if (url.endsWith("/user_info")) return Response.json({ code: 0, data: identity });
      throw new Error("Unexpected API");
    });
    const deps: LarkAuthServiceDeps = { appId: "cli_test", appSecret: "secret", fetchImpl, resolvedUserStore, oauthSessionStore, tokenStore, webSessionStore: new PostgresWebSessionStore(db) };
    return { db, deps, fetchImpl, resolvedUserStore, tokenStore, oauthSessionStore };
  }
  it("reuses the tenant-scoped user, preserves permissions/tokens, and exposes verified IDs", async () => {
    const { db, deps, resolvedUserStore, tokenStore } = await setup();
    try {
      const user = await resolvedUserStore.create({ status: "active", larkTenantKey: "tenant_a", larkId: "ou_current", role: "dev" });
      await tokenStore.save({ masterUserId: user.id, tenantKey: "tenant_a", larkUserId: "ou_current", baseUrl, userToken: "broad-token", userTokenExpiresAt: "2099-01-01T00:00:00.000Z", credentialStatus: "active" });
      const challenge = await startLarkH5Login(baseUrl, deps);
      const result = await completeLarkH5Login({ ...challenge, code: "code", actionRunId }, deps);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Login failed");
      const profile = await getLarkWebProfile(result.sessionToken, deps);
      expect(profile).toMatchObject({ ok: true, profile: { user: { id: user.id, larkOpenId: "ou_current", larkTenantKey: "tenant_a" }, workspaceAccess: { platformLists: true } } });
      expect(JSON.stringify(profile)).not.toContain("token");
      expect((await tokenStore.get({ masterUserId: user.id, baseUrl }))?.userToken).toBe("broad-token");
      expect((await completeLarkH5Login({ ...challenge, code: "code", actionRunId }, deps)).ok).toBe(false);
    } finally { await db.destroy(); }
  });
  it("rejects another browser, expiry and concurrent replay before exchanging code", async () => {
    const { db, deps, fetchImpl } = await setup();
    try {
      const challenge = await startLarkH5Login(baseUrl, deps);
      const input = { ...challenge, code: "code", actionRunId };
      expect((await completeLarkH5Login({ ...input, browserProof: "wrong" }, deps)).ok).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
      const results = await Promise.all([completeLarkH5Login(input, deps), completeLarkH5Login(input, deps)]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const expired = await startLarkH5Login(baseUrl, deps);
      const state = `h5:${createHash("sha256").update(`${expired.challengeId}.${expired.browserProof}`).digest("hex")}`;
      await db.updateTable("oauth_sessions").set({ expires_at: "2000-01-01T00:00:00.000Z" }).where("state", "=", state).execute();
      fetchImpl.mockClear();
      expect((await completeLarkH5Login({ ...expired, code: "code", actionRunId }, deps)).ok).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally { await db.destroy(); }
  });
  it("new users gain no platform permission; identical openId in another tenant is not reused", async () => {
    const { db, deps, resolvedUserStore } = await setup();
    try {
      const other = await resolvedUserStore.create({ status: "active", larkTenantKey: "tenant_b", larkId: "ou_current", role: "admin" });
      const result = await completeLarkH5Login({ ...await startLarkH5Login(baseUrl, deps), code: "code", actionRunId }, deps);
      if (!result.ok) throw new Error("Login failed");
      const profile = await getLarkWebProfile(result.sessionToken, deps);
      expect(profile).toMatchObject({ ok: true, profile: { workspaceAccess: { platformLists: false } } });
      if (profile.ok) expect(profile.profile.user.id).not.toBe(other.id);
    } finally { await db.destroy(); }
  });
  it("rejects incomplete platform identity and does not reactivate a conflicted user", async () => {
    for (const identity of [{ user_id: "not-open-id", tenant_key: "tenant_a" }, { open_id: "ou_current", tenant_key: "tenant_a" }]) {
      const { db, deps, resolvedUserStore } = await setup(identity);
      try {
        await resolvedUserStore.create({ status: "conflict", larkTenantKey: "tenant_a", larkId: "ou_current", role: "admin" });
        const result = await completeLarkH5Login({ ...await startLarkH5Login(baseUrl, deps), code: "code", actionRunId }, deps);
        expect(result.ok).toBe(false);
        expect(await db.selectFrom("web_sessions").selectAll().execute()).toHaveLength(0);
        expect((await resolvedUserStore.getByLarkIdentity("tenant_a", "ou_current"))?.status).toBe("conflict");
      } finally { await db.destroy(); }
    }
  });
});
