export function getOdooShBuildTone(result) {
  switch (String(result || "").toLocaleLowerCase()) {
    case "failed":
      return "failed";
    case "warning":
      return "warning";
    case "success":
      return "success";
    default:
      return "unknown";
  }
}

// Mirrors the server's odoo-devops-environment-mapping: an Odoo.sh environment
// can be inferred from the GitHub repo alone, without fetching builds.
const githubRepoEnvironmentMap = {
  tenways: "eu",
  "tenways-ukk": "uk",
  odoo_tenways: "us",
};

export function resolveGitHubRepoEnvironment(repo) {
  return githubRepoEnvironmentMap[String(repo || "").trim().toLocaleLowerCase()];
}

export function indexOdooShBuilds(environments) {
  return new Map(environments.map((item) => [item.environment, {
    ...item,
    builds: new Map(item.builds.map((build) => [build.branch, build])),
  }]));
}

export function getSharedOdooShBuildState(shared, pullRequest) {
  const environment = resolveGitHubRepoEnvironment(pullRequest.repo);
  if (!environment || !pullRequest.headRef) return { status: "unavailable", builds: [] };
  if (shared.status !== "ready") return { status: shared.status, builds: [] };
  const entry = shared.environments.get(environment);
  if (entry?.state !== "ready") return { status: "unavailable", builds: [] };
  const build = entry.builds.get(pullRequest.headRef);
  return {
    status: entry.stale ? "stale" : "ready",
    builds: build ? [{ environment, status: build.status, result: build.result }] : [],
  };
}

// Maps the Meegle system field to an environment. The platform-data list
// serves the server-normalized value (bare "eu"/"us"/"uk"); Odoo-prefixed
// labels stay supported for raw values, ambiguous combinations resolve to
// undefined.
export function resolveMeegleSystemEnvironment(system) {
  const normalized = String(system || "").trim().toLocaleLowerCase();
  if (normalized === "eu" || normalized === "uk" || normalized === "us") {
    return normalized;
  }
  if (normalized === "odoo" || normalized === "od") {
    return "eu";
  }
  const matches = new Set();
  if (/\b(?:odoo|od)\s+eu\b/.test(normalized)) matches.add("eu");
  if (/\b(?:odoo|od)\s+uk\b/.test(normalized)) matches.add("uk");
  if (/\b(?:odoo|od)\s+us\b/.test(normalized)) matches.add("us");
  return matches.size === 1 ? [...matches][0] : undefined;
}
