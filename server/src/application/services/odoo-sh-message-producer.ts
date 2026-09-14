import { logger } from "../../logger.js";
import { buildOdooShFailureMessage, isConfirmedBuildFailure, type OdooShEnvironment } from "../../domain/odoo-sh-builds.js";
import type { PostgresOdooShBuildStore } from "../../adapters/postgres/odoo-sh-build-store.js";
import type { ResolvedUserRecord } from "../../adapters/postgres/resolved-user-store.js";

const producerLogger = logger.child({ module: "odoo-sh-message-producer" });

/** Business-specific decisions end here; delivery receives only a complete message. */
export class OdooShMessageProducer {
  constructor(private readonly deps: {
    store: Pick<PostgresOdooShBuildStore, "listBuildsByProject" | "listNotificationsForPreparation" | "prepareNotification" | "reclaimExpiredClaims">;
    resolveCommitAuthor: (build: { headCommitAuthor?: string | null }) => Promise<ResolvedUserRecord | undefined>;
    chatId: string;
  }) {}

  async prepare(environment: OdooShEnvironment, projectId: number): Promise<void> {
    await this.deps.store.reclaimExpiredClaims({ now: new Date().toISOString() });
    const builds = new Map((await this.deps.store.listBuildsByProject(environment, projectId)).map((b) => [b.buildId, b]));
    const events = await this.deps.store.listNotificationsForPreparation(environment, projectId);
    for (const event of events) {
      const context = { actionRunId: `odoo-sh-prepare-${event.id}`, layer: "server", stage: "server.notify.prepare" };
      try {
        const build = builds.get(event.buildId);
        if (!build) throw new Error("ODOO_SH_NOTIFY_BUILD_MISSING");
        if (!isConfirmedBuildFailure(build.lastBuildResult)) {
          await this.deps.store.prepareNotification(event.id, build, null);
          continue;
        }
        if (event.status === "queued") continue;
        const author = await this.deps.resolveCommitAuthor(build);
        const mention = author?.status === "active" && author.larkId
          ? { openId: author.larkId, label: author.larkName || build.headCommitAuthor || "Commit 作者" }
          : null;
        if (!mention) producerLogger.warn({ ...context, errorCode: "ODOO_SH_NOTIFY_AUTHOR_UNRESOLVED" }, "ODOO_SH_MESSAGE_WITHOUT_MENTION");
        const text = buildOdooShFailureMessage({ ...build, environment, mention });
        await this.deps.store.prepareNotification(event.id, build, {
          idempotencyKey: `odoo-sh-build-notify:${event.id}`, chatId: this.deps.chatId, text,
        });
      } catch {
        // The durable business event remains pending for the next successful refresh.
        producerLogger.error({ ...context, errorCode: "ODOO_SH_MESSAGE_PREPARE_FAILED" }, "ODOO_SH_MESSAGE_PREPARE_FAILED");
      }
    }
  }
}
