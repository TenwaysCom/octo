import { createOdooShCommitAuthorResolver, parseOdooShAuthorGithubMapping } from "./odoo-sh-commit-author.service.js";
import { PostgresResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";

it.each([
  ["Jack", "13715928974"], [" jack ", "13715928974"], ["JACK", "13715928974"],
  ["ytd", "achieveIdeal"], ["YTD", "achieveIdeal"], ["Ben LIN", "uynil"],
])("maps configured author %s to GitHub login %s", async (headCommitAuthor, login) => {
  const users = { getByGithubId: vi.fn().mockResolvedValue({ status: "active", larkId: "ou_user" }) };
  const resolve = createOdooShCommitAuthorResolver({ mapping: parseOdooShAuthorGithubMapping(), users });
  expect(await resolve({ headCommitAuthor })).toMatchObject({ larkId: "ou_user" });
  expect(users.getByGithubId).toHaveBeenCalledWith(login);
});
it("supports replacing mappings, rejects conflicts and invalid JSON, and never guesses unknown authors", async () => {
  const mapping = parseOdooShAuthorGithubMapping('{" New Name ":"new-login"}');
  expect(mapping.get("new name")).toBe("new-login");
  expect(mapping.has("jack")).toBe(false);
  expect(parseOdooShAuthorGithubMapping("{}").size).toBe(0);
  expect(() => parseOdooShAuthorGithubMapping('{"jack":"a","Jack":"b"}')).toThrow("ODOO_SH_AUTHOR_MAPPING_CONFLICT");
  expect(() => parseOdooShAuthorGithubMapping("invalid")).toThrow();
  expect(() => parseOdooShAuthorGithubMapping('{"jack":null}')).toThrow();
  const users = { getByGithubId: vi.fn() };
  const resolve = createOdooShCommitAuthorResolver({ mapping, users });
  expect(await resolve({ headCommitAuthor: "Jack" })).toBeUndefined();
  expect(await resolve({ headCommitAuthor: null })).toBeUndefined();
  expect(users.getByGithubId).not.toHaveBeenCalled();
});
it("resolves only a unique active GitHub login binding, including case variations", async () => {
  const { db, pool } = await createTestPostgresDatabase();
  try {
    const users = new PostgresResolvedUserStore(db);
    const user = await users.create({ status: "active", githubId: "AchieveIdeal", larkId: "ou_jason" });
    const resolve = createOdooShCommitAuthorResolver({ mapping: parseOdooShAuthorGithubMapping(), users });
    expect(await resolve({ headCommitAuthor: "YTD" })).toMatchObject({ id: user.id, larkId: "ou_jason" });
    await users.create({ status: "active", githubId: "ACHIEVEIDEAL", larkId: "ou_other" });
    expect(await resolve({ headCommitAuthor: "ytd" })).toBeUndefined();
  } finally { await db.destroy(); await pool.end(); }
});
it.each(["conflict", "pending_lark_identity"])("does not mention an inactive %s binding", async (status) => {
  const users = { getByGithubId: vi.fn().mockResolvedValue({ status, larkId: "ou_jack" }) };
  const resolve = createOdooShCommitAuthorResolver({ mapping: parseOdooShAuthorGithubMapping(), users });
  expect(await resolve({ headCommitAuthor: "Jack" })).toBeUndefined();
});
