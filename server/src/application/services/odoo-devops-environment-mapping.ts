import type { OdooDevopsEnvironment } from "../../adapters/odoo-devops/odoo-devops-branches-client.js";

export interface GitHubRepositoryRef {
  owner: string;
  repo: string;
}

const githubRepositoryByEnvironment: Record<OdooDevopsEnvironment, GitHubRepositoryRef> = {
  eu: { owner: "TenwaysCom", repo: "Tenways" },
  uk: { owner: "TenwaysCom", repo: "tenways-ukk" },
  us: { owner: "TWS-lance", repo: "odoo_tenways" },
};

const githubRepoEnvironmentMap = Object.fromEntries(
  Object.entries(githubRepositoryByEnvironment).map(([environment, repository]) => [
    repository.repo.toLocaleLowerCase(),
    environment as OdooDevopsEnvironment,
  ]),
);

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

export function resolveMeegleSystemGitHubRepository(system: string | undefined): GitHubRepositoryRef | undefined {
  const environment = resolveMeegleSystemEnvironment(system);
  return environment ? githubRepositoryByEnvironment[environment] : undefined;
}
