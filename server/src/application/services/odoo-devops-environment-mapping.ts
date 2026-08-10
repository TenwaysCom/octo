import type { OdooDevopsEnvironment } from "../../adapters/odoo-devops/odoo-devops-branches-client.js";

const githubRepoEnvironmentMap: Record<string, OdooDevopsEnvironment> = {
  tenways: "eu",
  "tenways-ukk": "uk",
  odoo_tenways: "us",
};

export function resolveMeegleSystemEnvironment(system: string | undefined): OdooDevopsEnvironment | undefined {
  const normalized = system?.trim().toLocaleLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "odoo" || normalized === "od") {
    return "eu";
  }

  const matches = new Set<OdooDevopsEnvironment>();
  if (/\b(?:odoo|od)\s+eu\b/.test(normalized)) matches.add("eu");
  if (/\b(?:odoo|od)\s+uk\b/.test(normalized)) matches.add("uk");
  if (/\b(?:odoo|od)\s+us\b/.test(normalized)) matches.add("us");
  return matches.size === 1 ? [...matches][0] : undefined;
}

export function resolveGitHubRepoEnvironment(repo: string): OdooDevopsEnvironment | undefined {
  return githubRepoEnvironmentMap[repo.trim().toLocaleLowerCase()];
}
