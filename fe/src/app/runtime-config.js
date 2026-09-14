function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function getFrontendConfig(env) {
  const configuredApiBaseUrl = env.VITE_API_BASE_URL?.trim();
  if (!configuredApiBaseUrl) {
    throw new Error("VITE_API_BASE_URL is required.");
  }

  return {
    apiBaseUrl: trimTrailingSlash(configuredApiBaseUrl),
  };
}

export function buildApiUrl(apiBaseUrl, path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimTrailingSlash(apiBaseUrl)}${normalizedPath}`;
}
