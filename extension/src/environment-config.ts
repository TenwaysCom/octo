/** Exact Octo server origins supported by the packaged extension. */
export const OCTO_SERVER_URLS = {
  prod: "https://octo.odoo.tenways.it:18443",
  test: "https://octotest.odoo.tenways.it:18443",
  dev: "http://localhost:3040",
} as const;

export type OctoEnvironmentName = keyof typeof OCTO_SERVER_URLS;

export function parseOctoWebAllowedOrigins(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return Array.from(new Set(value.split(",").map((item) => {
    const configuredOrigin = item.trim();
    let url: URL;
    try {
      url = new URL(configuredOrigin);
    } catch {
      throw new Error(`WXT_PUBLIC_OCTO_WEB_ALLOWED_ORIGINS contains an invalid origin: ${configuredOrigin}`);
    }
    if (url.origin === "null" || url.pathname !== "/" || url.search || url.hash) {
      throw new Error(`WXT_PUBLIC_OCTO_WEB_ALLOWED_ORIGINS must contain origins only: ${configuredOrigin}`);
    }
    return url.origin;
  })));
}

export function buildOctoWebContentMatches(origins: readonly string[]): string[] {
  return Array.from(new Set(origins.map((origin) => {
    const url = new URL(origin);
    return `${url.protocol}//${url.hostname}/*`;
  })));
}

export function isOctoWebOriginAllowed(input: {
  pageOrigin: string;
  serverUrl: string;
  additionalAllowedOrigins?: readonly string[];
}): boolean {
  let serverOrigin: string;
  try {
    serverOrigin = new URL(input.serverUrl).origin;
  } catch {
    return false;
  }
  return [serverOrigin, ...(input.additionalAllowedOrigins ?? [])]
    .includes(input.pageOrigin);
}
