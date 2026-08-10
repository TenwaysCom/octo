import { logger } from "../../logger.js";

const clientLogger = logger.child({ module: "odoo-devops-branches-client" });

export type OdooDevopsEnvironment = "eu" | "uk" | "us";

export class OdooDevopsBranchesClientError extends Error {
  constructor(
    readonly code: "ODOO_DEVOPS_NOT_CONFIGURED" | "ODOO_DEVOPS_AUTH_REQUIRED" | "ODOO_DEVOPS_UNAVAILABLE",
  ) {
    super(code);
    this.name = "OdooDevopsBranchesClientError";
  }
}

export interface OdooDevopsBranchesClient {
  listBranches(environment: OdooDevopsEnvironment): Promise<unknown>;
}

export function createHttpOdooDevopsBranchesClient(options: {
  baseUrl: string;
  session: string;
  fetchImpl?: typeof fetch;
}): OdooDevopsBranchesClient {
  const baseUrl = readHttpsBaseUrl(options.baseUrl);
  const session = readSession(options.session);
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async listBranches(environment) {
      if (!baseUrl || !session) {
        throw new OdooDevopsBranchesClientError("ODOO_DEVOPS_NOT_CONFIGURED");
      }

      const url = new URL(`/api/v1/odoo-sh/${environment}/branches`, baseUrl);
      url.searchParams.set("stage", "all");

      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: {
            accept: "application/json",
            cookie: `odoo_devops_new_prod_session=${session}`,
          },
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        clientLogger.warn({ environment }, "ODOO_DEVOPS_BRANCHES_REQUEST_FAILED");
        throw new OdooDevopsBranchesClientError("ODOO_DEVOPS_UNAVAILABLE");
      }

      if (response.status === 401 || response.status === 403 || response.status >= 300 && response.status < 400) {
        clientLogger.warn({ environment, status: response.status }, "ODOO_DEVOPS_BRANCHES_AUTH_REJECTED");
        throw new OdooDevopsBranchesClientError("ODOO_DEVOPS_AUTH_REQUIRED");
      }
      if (!response.ok) {
        clientLogger.warn({ environment, status: response.status }, "ODOO_DEVOPS_BRANCHES_REQUEST_FAILED");
        throw new OdooDevopsBranchesClientError("ODOO_DEVOPS_UNAVAILABLE");
      }

      try {
        return await response.json();
      } catch {
        clientLogger.warn({ environment, status: response.status }, "ODOO_DEVOPS_BRANCHES_INVALID_JSON");
        throw new OdooDevopsBranchesClientError("ODOO_DEVOPS_UNAVAILABLE");
      }
    },
  };
}

function readHttpsBaseUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function readSession(value: string): string | undefined {
  const session = value.trim();
  return session && !/[\r\n;]/.test(session) ? session : undefined;
}
