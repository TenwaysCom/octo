/** Exact Octo server origins supported by the packaged extension. */
export const OCTO_SERVER_URLS = {
  prod: "https://octo.odoo.tenways.it:18443",
  test: "https://octotest.odoo.tenways.it:18443",
  dev: "http://localhost:3040",
} as const;

export type OctoEnvironmentName = keyof typeof OCTO_SERVER_URLS;

export const OCTO_WEB_CONTENT_MATCHES = Array.from(new Set(
  Object.values(OCTO_SERVER_URLS).map((origin) => {
    const url = new URL(origin);
    return `${url.protocol}//${url.hostname}/*`;
  }),
));
