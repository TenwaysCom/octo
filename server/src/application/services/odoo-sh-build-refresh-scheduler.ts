import { randomUUID } from "node:crypto";
import { OdooDevopsBranchesClientError, type OdooDevopsEnvironment } from "../../adapters/odoo-devops/odoo-devops-branches-client.js";
import { logger } from "../../logger.js";

export const ODOO_SH_BUILD_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const ENVIRONMENTS: OdooDevopsEnvironment[] = ["eu", "uk", "us"];
const schedulerLogger = logger.child({ module: "odoo-sh-build-refresh-scheduler" });

/** Server-owned timer; refresh itself performs validation, durable sync and notification queuing. */
export class OdooShBuildRefreshScheduler {
  private timer: NodeJS.Timeout | undefined;
  private active: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly deps: {
    refresh(environment: OdooDevopsEnvironment): Promise<unknown>;
    intervalMs?: number;
    notifyAuthFailure?: (input: { actionRunId: string; environments: OdooDevopsEnvironment[] }) => Promise<void>;
  }) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => { void this.runCycle(); }, this.deps.intervalMs ?? ODOO_SH_BUILD_REFRESH_INTERVAL_MS);
    this.timer.unref();
    void this.runCycle();
    schedulerLogger.info({
      actionRunId: randomUUID(), layer: "server", module: "odoo-sh-build-refresh-scheduler",
      stage: "server.refresh.started", intervalMs: this.deps.intervalMs ?? ODOO_SH_BUILD_REFRESH_INTERVAL_MS,
    }, "ODOO_SH_BUILD_REFRESH_STARTED");
  }

  /** Stop future ticks and drain an active refresh before the database closes. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.active;
  }

  runCycle(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.active) return this.active;
    this.active = this.refreshAll().finally(() => { this.active = undefined; });
    return this.active;
  }

  private async refreshAll(): Promise<void> {
    const actionRunId = randomUUID();
    const authFailures = new Set<OdooDevopsEnvironment>();
    await Promise.all(ENVIRONMENTS.map(async (environment) => {
      const context = { actionRunId, environment, layer: "server", module: "odoo-sh-build-refresh-scheduler" };
      try {
        await this.deps.refresh(environment);
        schedulerLogger.info({ ...context, stage: "server.refresh.completed" }, "ODOO_SH_BUILD_REFRESH_COMPLETED");
      } catch (error) {
        const authRequired = error instanceof OdooDevopsBranchesClientError && error.code === "ODOO_DEVOPS_AUTH_REQUIRED";
        if (authRequired) authFailures.add(environment);
        // No raw upstream response, session or credentials in timer diagnostics.
        schedulerLogger.error({ ...context, stage: "server.refresh.failed", errorCode: authRequired ? "ODOO_DEVOPS_AUTH_REQUIRED" : "ODOO_SH_BUILD_REFRESH_FAILED" }, "ODOO_SH_BUILD_REFRESH_FAILED");
      }
    }));
    if (authFailures.size && this.deps.notifyAuthFailure) {
      try {
        await this.deps.notifyAuthFailure({ actionRunId, environments: ENVIRONMENTS.filter((environment) => authFailures.has(environment)) });
      } catch {
        schedulerLogger.error({
          actionRunId, layer: "server", stage: "server.auth_notification.failed",
          errorCode: "ODOO_DEVOPS_AUTH_NOTIFICATION_FAILED",
        }, "ODOO_DEVOPS_AUTH_NOTIFICATION_FAILED");
      }
    }
  }
}
