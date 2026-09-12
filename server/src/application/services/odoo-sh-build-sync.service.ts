import { logger } from "../../logger.js";
import { isConfirmedBuildFailure } from "../../domain/odoo-sh-builds.js";
import type { OdooDevopsBuildsSnapshot } from "../../modules/odoo-devops-branches/odoo-devops-branches.dto.js";
import type { OdooShBuildStore, OdooShBuildUpsertInput, OdooShSnapshotSyncInput } from "../../adapters/postgres/odoo-sh-build-store.js";

const syncLogger = logger.child({ module: "odoo-sh-build-sync-service" });

/** 保存全部返回记录；初始化标记与基线原子持久化；后续通知所有新 build 失败或失败转换。 */
export class OdooShBuildSyncService {
  constructor(private readonly deps: { store: OdooShBuildStore }) {}

  async syncFromSnapshot(snapshot: OdooDevopsBuildsSnapshot) {
    const environment = snapshot.environment;
    const projectId = snapshot.project_id;
    const existing = await this.deps.store.listBuildsByProject(environment, projectId);
    const existingById = new Map(existing.map((build) => [build.buildId, build]));
    const baseline = !await this.deps.store.hasBuildBaseline(environment, projectId);
    const input: OdooShSnapshotSyncInput = {
      environment, projectId, inserts: [], updates: [], touchBuildIds: [], notifications: [],
      observedAt: new Date().toISOString(),
      initializeBaseline: baseline,
    };
    const seen = new Set<number>();
    for (const group of snapshot.items) {
      for (const build of group.builds) {
        if (seen.has(build.id)) throw new Error("ODOO_SH_DUPLICATE_BUILD_ID");
        seen.add(build.id);
        const previous = existingById.get(build.id);
        const item: OdooShBuildUpsertInput = {
          buildId: build.id,
          branch: group.branch_info.name,
          stage: build.stage,
          odooBranch: build.odoo_branch,
          lastBuildStatus: build.status,
          lastBuildResult: build.result,
          buildUrl: build.url?.trim() || null,
          commitSha: build.head_commit_url?.match(/\/commit\/([a-f0-9]{40})$/i)?.[1] ?? null,
          headCommitAuthor: build.head_commit_author?.trim() || null,
          headCommitUrl: build.head_commit_url?.trim() || null,
          pusherGithubId: previous?.pusherGithubId ?? null,
        };
        if (!previous) input.inserts.push(item);
        else if ((Object.keys(item) as Array<keyof OdooShBuildUpsertInput>).some((key) => previous[key] !== item[key])) {
          input.updates.push({ ...item, previousPusherGithubId: previous.pusherGithubId });
        } else input.touchBuildIds.push(build.id);
        // Inspect every returned build: a failure between polls may no longer be the head build.
        if (!baseline && isConfirmedBuildFailure(build.result)
          && (!previous || !isConfirmedBuildFailure(previous.lastBuildResult))) {
          input.notifications.push({ environment, projectId, buildId: build.id, status: "pending_send" });
        }
      }
    }
    const result = await this.deps.store.applySnapshotSync(input);
    syncLogger.info({
      actionRunId: `odoo-sh-sync-${environment}-${Date.now()}`,
      operation: "odoo_sh_build_sync", layer: "server", module: "odoo-sh-build-sync",
      stage: baseline ? "server.sync.baseline" : "server.sync.completed",
      environment, projectId, baseline, ...result,
    }, "ODOO_SH_BUILD_SYNC");
    return { environment, projectId, baseline, ...result };
  }
}
