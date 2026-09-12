import { z } from "zod";
import type { ResolvedUserRecord } from "../../adapters/postgres/resolved-user-store.js";

const DEFAULT_AUTHOR_GITHUB_MAPPING: Record<string, string> = {
  jack: "13715928974",
  ytd: "achieveIdeal",
  "ben lin": "uynil",
};
const mappingSchema = z.record(z.string().trim().min(1), z.string().trim().min(1));

/** An explicit JSON value replaces the defaults. Empty {} disables all aliases. */
export function parseOdooShAuthorGithubMapping(value?: string): ReadonlyMap<string, string> {
  const input = value?.trim() ? mappingSchema.parse(JSON.parse(value)) : DEFAULT_AUTHOR_GITHUB_MAPPING;
  const result = new Map<string, string>();
  for (const [author, githubLogin] of Object.entries(input)) {
    const key = author.trim().toLowerCase();
    const previous = result.get(key);
    if (previous && previous.toLowerCase() !== githubLogin.toLowerCase()) {
      throw new Error("ODOO_SH_AUTHOR_MAPPING_CONFLICT");
    }
    result.set(key, githubLogin);
  }
  return result;
}

/** Only configured aliases resolve; unknown display names never become inferred accounts. */
export function createOdooShCommitAuthorResolver(deps: {
  mapping: ReadonlyMap<string, string>;
  users: { getByGithubId(id: string): Promise<ResolvedUserRecord | undefined> };
}) {
  return async (build: { headCommitAuthor?: string | null }): Promise<ResolvedUserRecord | undefined> => {
    const login = deps.mapping.get(build.headCommitAuthor?.trim().toLowerCase() ?? "");
    if (!login) return undefined;
    const user = await deps.users.getByGithubId(login);
    return user?.status === "active" && user.larkId ? user : undefined;
  };
}
