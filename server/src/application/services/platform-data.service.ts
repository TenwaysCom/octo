import {
  PostgresPlatformSyncStore,
  type PlatformSyncStore,
} from "../../adapters/postgres/platform-sync-store.js";

export type PlatformDataKind = "lark-tickets" | "meegle-workitems" | "github-pull-requests";

export class PlatformDataService {
  private store?: PlatformSyncStore;

  constructor(store?: PlatformSyncStore) {
    this.store = store;
  }

  async list(kind: PlatformDataKind, limit: number, filters: { sprint?: string } = {}) {
    switch (kind) {
      case "lark-tickets":
        return { items: await this.syncStore.listLarkBaseTickets(limit) };
      case "meegle-workitems":
        return {
          items: await this.syncStore.listMeegleWorkitems(limit, filters.sprint),
          sprints: await this.syncStore.listMeegleSprints(),
        };
      case "github-pull-requests":
        return { items: await this.syncStore.listGitHubPullRequests(limit) };
    }
  }

  private get syncStore(): PlatformSyncStore {
    this.store ??= new PostgresPlatformSyncStore();
    return this.store;
  }
}
