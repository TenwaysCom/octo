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
