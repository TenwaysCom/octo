import { randomUUID } from "node:crypto";
import { logger } from "../../logger.js";
import {
  buildOdooShFailureMessage,
  isConfirmedBuildFailure,
  type OdooShEnvironment,
} from "../../domain/odoo-sh-builds.js";
import type {
  OdooShBuildStore,
  OdooShClaimedNotification,
} from "../../adapters/postgres/odoo-sh-build-store.js";
import type { LarkImNotificationClient, LarkImNotificationError } from "../../adapters/lark/im-notification-client.js";
import type { ResolvedUserRecord } from "../../adapters/postgres/resolved-user-store.js";

const notifyLogger = logger.child({ module: "odoo-sh-build-notification-service" });
const MODULE = "odoo-sh-build-notification";

export interface OdooShBuildNotificationDeps {
  store: OdooShBuildStore;
  sender: Pick<LarkImNotificationClient, "sendMessageToChat">;
  resolveCommitAuthor: (build: { headCommitAuthor?: string | null }) => Promise<ResolvedUserRecord | undefined>;
  config: {
    chatId: string;
    /** 单个通知的处理上限；耗尽后进入 failed 保留原因，等待人工排查。 */
    maxAttempts: number;
    /** 可重试明确失败的退避基数，按尝试次数指数放大，上限 1 小时。 */
    retryDelayMs: number;
    claimDurationMs: number;
    batchSize: number;
  };
}

export interface OdooShNotificationCycleResult {
  reclaimed: number;
  sent: number;
  pendingIdentity: number;
  retried: number;
  failed: number;
  outcomeUnknown: number;
}

/**
 * 通知消费循环：从持久化队列原子领取任务，在事务外解析推送人并调用 Lark，
 * 再写回结果。进程崩溃后由 claim 过期回收恢复；结果不确定时保持待核实状态。
 */
export class OdooShBuildNotificationConsumer {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;

  constructor(private readonly deps: OdooShBuildNotificationDeps) {}

  start(intervalMs: number): void {
    if (this.timer) {
      return;
    }
    this.stopped = false;
    this.timer = setInterval(() => {
      void this.runCycle().catch(() => {
        notifyLogger.error({
          actionRunId: randomUUID(), operation: "odoo_sh_build_notify", layer: "server",
          module: MODULE, stage: "server.notify.cycle_failed", errorCode: "ODOO_SH_NOTIFY_CYCLE_FAILED",
        }, "ODOO_SH_BUILD_NOTIFY_CYCLE_FAILED");
      });
    }, intervalMs);
    this.timer.unref?.();
    notifyLogger.info({
      operation: "odoo_sh_build_notify",
      layer: "server",
      module: MODULE,
      stage: "server.notify.started",
      intervalMs,
    }, "ODOO_SH_BUILD_NOTIFY_CONSUMER_STARTED");
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runCycle(): Promise<OdooShNotificationCycleResult> {
    if (this.running || this.stopped) {
      return emptyCycleResult();
    }
    this.running = true;
    try {
      const now = new Date();
      const reclaimed = await this.deps.store.reclaimExpiredClaims({
        now: now.toISOString(),
      });
      const result = emptyCycleResult();
      result.reclaimed = reclaimed;

      const dueIds = await this.deps.store.listDueNotificationIds({
        maxAttempts: this.deps.config.maxAttempts,
        now: now.toISOString(),
        limit: this.deps.config.batchSize,
      });
      for (const notificationId of dueIds) {
        const claimed = await this.deps.store.claimNotification(
          notificationId,
          this.deps.config.claimDurationMs,
          new Date().toISOString(),
        );
        // 并发消费者领取失败说明任务已被他人处理。
        if (!claimed) {
          continue;
        }
        await this.processClaimed(claimed, result);
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  private async processClaimed(claimed: OdooShClaimedNotification, result: OdooShNotificationCycleResult): Promise<void> {
    const actionRunId = `odoo-sh-notify-${claimed.id}`;
    const logBase = {
      actionRunId,
      operation: "odoo_sh_build_notify",
      layer: "server" as const,
      module: MODULE,
      environment: claimed.environment,
      projectId: claimed.projectId,
      buildId: claimed.buildId,
      attempt: claimed.attempts,
    };

    let deliveredMessageId: string | undefined;
    try {
      const build = await this.findBuild(claimed);
      if (!build) {
        // build 记录缺失属于数据不一致：不入队重试，保留原因供排查。
        await this.deps.store.markNotificationFailed(claimed.id, {
          errorCode: "ODOO_SH_NOTIFY_BUILD_MISSING",
          errorMessage: "通知对应 build 记录不存在",
          now: new Date().toISOString(),
        });
        result.failed += 1;
        notifyLogger.error({ ...logBase, stage: "server.notify.build_missing", errorCode: "ODOO_SH_NOTIFY_BUILD_MISSING" }, "server.workflow.failed");
        return;
      }

      if (!isConfirmedBuildFailure(build.lastBuildResult)) {
        await this.deps.store.markNotificationFailed(claimed.id, {
          errorCode: "ODOO_SH_NOTIFY_BUILD_NO_LONGER_FAILED",
          errorMessage: "当前 build 结果已不再失败，取消旧通知",
          now: new Date().toISOString(),
        });
        result.failed += 1;
        return;
      }

      const author = await this.deps.resolveCommitAuthor(build);
      const mention = author?.status === "active" && author.larkId
        ? { openId: author.larkId, label: author.larkName || build.headCommitAuthor || "Commit 作者" }
        : null;
      if (!mention) {
        notifyLogger.warn({ ...logBase, stage: "server.notify.author_unresolved", errorCode: "ODOO_SH_NOTIFY_AUTHOR_UNRESOLVED" }, "ODOO_SH_BUILD_NOTIFY_WITHOUT_MENTION");
      }

      const text = buildOdooShFailureMessage({
        environment: claimed.environment as OdooShEnvironment,
        branch: build.branch,
        buildId: build.buildId,
        lastBuildResult: build.lastBuildResult,
        commitSha: build.commitSha,
        buildUrl: build.buildUrl,
        headCommitAuthor: build.headCommitAuthor,
        headCommitUrl: build.headCommitUrl,
        mention,
      });
      const sendResult = await this.deps.sender.sendMessageToChat({
        chatId: this.deps.config.chatId,
        text,
        idempotencyKey: `odoo-sh-build-notify:${claimed.id}`,
      });
      deliveredMessageId = sendResult.messageId;
      await this.deps.store.markNotificationSent(claimed.id, deliveredMessageId, new Date().toISOString());
      result.sent += 1;
      notifyLogger.info({
        ...logBase,
        stage: "server.notify.sent",
        messageId: sendResult.messageId,
      }, "ODOO_SH_BUILD_NOTIFY_SENT");
    } catch (error) {
      const notificationError = error as LarkImNotificationError;
      const isTypedError = notificationError instanceof Error && "kind" in notificationError;
      const now = new Date().toISOString();
      if (deliveredMessageId || (isTypedError && notificationError.kind === "uncertain")) {
        await this.deps.store.markNotificationOutcomeUnknown(claimed.id, {
          errorCode: deliveredMessageId ? "ODOO_SH_NOTIFY_ACK_FAILED" : notificationError.errorCode,
          errorMessage: deliveredMessageId ? "Lark 已确认发送，但通知成功状态写回失败，禁止自动重发" : notificationError.message,
          ...(deliveredMessageId ? { messageId: deliveredMessageId } : {}),
          now,
        });
        result.outcomeUnknown += 1;
        notifyLogger.error({
          ...logBase,
          stage: "server.notify.outcome_unknown",
          errorCode: deliveredMessageId ? "ODOO_SH_NOTIFY_ACK_FAILED" : notificationError.errorCode,
        }, "ODOO_SH_BUILD_NOTIFY_OUTCOME_UNKNOWN");
        return;
      }

      const attemptsExhausted = claimed.attempts >= this.deps.config.maxAttempts;
      const errorCode = isTypedError ? notificationError.errorCode : "ODOO_SH_NOTIFY_SEND_FAILED";
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (attemptsExhausted || (isTypedError && notificationError.kind === "permanent")) {
        await this.deps.store.markNotificationFailed(claimed.id, { errorCode, errorMessage, now });
        result.failed += 1;
        notifyLogger.error({ ...logBase, stage: "server.notify.failed", errorCode }, "ODOO_SH_BUILD_NOTIFY_FAILED");
        return;
      }
      const nextAttemptAt = new Date(
        Date.now() + this.deps.config.retryDelayMs * 2 ** claimed.attempts,
      ).toISOString();
      await this.deps.store.markNotificationRetryableFailure(claimed.id, {
        errorCode,
        errorMessage,
        nextAttemptAt,
        now,
      });
      result.retried += 1;
      notifyLogger.warn({ ...logBase, stage: "server.notify.retry_scheduled", errorCode, nextAttemptAt }, "ODOO_SH_BUILD_NOTIFY_RETRY");
    }
  }

  private async findBuild(claimed: OdooShClaimedNotification) {
    const builds = await this.deps.store.listBuildsByProject(claimed.environment, claimed.projectId);
    return builds.find((build) => build.buildId === claimed.buildId);
  }
}

function emptyCycleResult(): OdooShNotificationCycleResult {
  return {
    reclaimed: 0,
    sent: 0,
    pendingIdentity: 0,
    retried: 0,
    failed: 0,
    outcomeUnknown: 0,
  };
}
