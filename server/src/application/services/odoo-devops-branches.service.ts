import type { OdooDevopsBranchesClient, OdooDevopsEnvironment } from "../../adapters/odoo-devops/odoo-devops-branches-client.js";
import type { ApiCache } from "../../http/redis-cache.js";
import { odooDevopsBranchesSnapshotSchema, type OdooDevopsBranchesSnapshot } from "../../modules/odoo-devops-branches/odoo-devops-branches.dto.js";

const CACHE_TTL_SECONDS = 30 * 60;
const REFRESH_FAILURE_RETRY_MS = 5_000;
const ODOO_DEVOPS_ENVIRONMENTS: OdooDevopsEnvironment[] = ["eu", "uk", "us"];

type CachedSnapshot = {
  snapshot: OdooDevopsBranchesSnapshot;
  fetchedAt: number;
};

export type OdooDevopsBranchesAsyncResult =
  | { state: "ready"; snapshot: OdooDevopsBranchesSnapshot; cached: boolean; stale: boolean }
  | { state: "refreshing" }
  | { state: "unavailable" };

export class OdooDevopsBranchesService {
  private readonly memorySnapshots = new Map<OdooDevopsEnvironment, CachedSnapshot>();
  private readonly refreshes = new Map<OdooDevopsEnvironment, Promise<void>>();
  private readonly refreshFailures = new Map<OdooDevopsEnvironment, number>();

  constructor(private readonly deps: {
    client: OdooDevopsBranchesClient;
    cache: ApiCache;
    cacheTtlSeconds?: number;
  }) {}

  async list(environment: OdooDevopsEnvironment): Promise<OdooDevopsBranchesSnapshot & { cached: boolean }> {
    const cached = await this.readSnapshot(environment);
    if (cached && !this.isStale(cached)) {
      return { ...cached.snapshot, cached: true };
    }

    const snapshot = await this.fetchAndCache(environment);
    return { ...snapshot, cached: false };
  }

  async getOrStartRefresh(environment: OdooDevopsEnvironment): Promise<OdooDevopsBranchesAsyncResult> {
    const cached = await this.readSnapshot(environment);
    if (cached) {
      const stale = this.isStale(cached);
      if (stale) this.startRefresh(environment);
      return { state: "ready", snapshot: cached.snapshot, cached: true, stale };
    }
    const failedAt = this.refreshFailures.get(environment);
    if (failedAt && Date.now() - failedAt < REFRESH_FAILURE_RETRY_MS) {
      return { state: "unavailable" };
    }
    this.refreshFailures.delete(environment);
    this.startRefresh(environment);
    return { state: "refreshing" };
  }

  async invalidate(environment: OdooDevopsEnvironment): Promise<boolean> {
    this.memorySnapshots.delete(environment);
    this.refreshFailures.delete(environment);
    return this.deps.cache.delete(cacheKey(environment));
  }

  async invalidateAll(): Promise<boolean> {
    const results = await Promise.all(ODOO_DEVOPS_ENVIRONMENTS.map((environment) => this.invalidate(environment)));
    return results.every(Boolean);
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

  private async readSnapshot(environment: OdooDevopsEnvironment): Promise<CachedSnapshot | undefined> {
    const memory = this.memorySnapshots.get(environment);
    if (memory) return memory;

    const snapshot = await this.readCached(cacheKey(environment));
    if (!snapshot) return undefined;
    const cached = { snapshot, fetchedAt: Date.now() };
    this.memorySnapshots.set(environment, cached);
    return cached;
  }

  private isStale(cached: CachedSnapshot): boolean {
    return Date.now() - cached.fetchedAt >= (this.deps.cacheTtlSeconds ?? CACHE_TTL_SECONDS) * 1000;
  }

  private startRefresh(environment: OdooDevopsEnvironment): void {
    if (this.refreshes.has(environment)) return;
    const refresh = this.fetchAndCache(environment)
      .then(() => { this.refreshFailures.delete(environment); })
      .catch(() => { this.refreshFailures.set(environment, Date.now()); })
      .finally(() => { this.refreshes.delete(environment); });
    this.refreshes.set(environment, refresh);
  }

  private async fetchAndCache(environment: OdooDevopsEnvironment): Promise<OdooDevopsBranchesSnapshot> {
    const snapshot = odooDevopsBranchesSnapshotSchema.parse(await this.deps.client.listBranches(environment));
    this.memorySnapshots.set(environment, { snapshot, fetchedAt: Date.now() });
    await this.deps.cache.set(cacheKey(environment), JSON.stringify(snapshot), this.deps.cacheTtlSeconds ?? CACHE_TTL_SECONDS);
    return snapshot;
  }
}

export function cacheKey(environment: OdooDevopsEnvironment): string {
  return `odoo-devops:branches:v1:${environment}`;
}

export { CACHE_TTL_SECONDS };
