import type { OdooDevopsBranchesClient, OdooDevopsEnvironment } from "../../adapters/odoo-devops/odoo-devops-branches-client.js";
import type { ApiCache } from "../../http/redis-cache.js";
import { odooDevopsBranchesSnapshotSchema, type OdooDevopsBranchesSnapshot } from "../../modules/odoo-devops-branches/odoo-devops-branches.dto.js";

const CACHE_TTL_SECONDS = 600;

export class OdooDevopsBranchesService {
  constructor(private readonly deps: {
    client: OdooDevopsBranchesClient;
    cache: ApiCache;
    cacheTtlSeconds?: number;
  }) {}

  async list(environment: OdooDevopsEnvironment): Promise<OdooDevopsBranchesSnapshot & { cached: boolean }> {
    const key = cacheKey(environment);
    const cached = await this.readCached(key);
    if (cached) {
      return { ...cached, cached: true };
    }

    const snapshot = odooDevopsBranchesSnapshotSchema.parse(await this.deps.client.listBranches(environment));
    await this.deps.cache.set(key, JSON.stringify(snapshot), this.deps.cacheTtlSeconds ?? CACHE_TTL_SECONDS);
    return { ...snapshot, cached: false };
  }

  private async readCached(key: string): Promise<OdooDevopsBranchesSnapshot | undefined> {
    try {
      const value = await this.deps.cache.get(key);
      if (!value) {
        return undefined;
      }
      return odooDevopsBranchesSnapshotSchema.safeParse(JSON.parse(value)).data;
    } catch {
      return undefined;
    }
  }
}

export function cacheKey(environment: OdooDevopsEnvironment): string {
  return `odoo-devops:branches:v1:${environment}`;
}

export { CACHE_TTL_SECONDS };
