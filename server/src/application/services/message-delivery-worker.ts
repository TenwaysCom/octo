import { randomUUID } from "node:crypto";
import { logger } from "../../logger.js";
import type { MessageOutboxStore, ClaimedMessage } from "../../adapters/postgres/message-outbox-store.js";
import type { LarkImNotificationClient, LarkImNotificationError } from "../../adapters/lark/im-notification-client.js";

const deliveryLogger = logger.child({ module: "message-delivery-worker" });

/** Sends prepared messages without consulting their originating business service. */
export class MessageDeliveryWorker {
  private timer: NodeJS.Timeout | undefined;
  private active: Promise<void> | undefined;
  private stopped = false;
  constructor(private readonly deps: {
    store: MessageOutboxStore;
    sender: Pick<LarkImNotificationClient, "sendMessageToChat">;
    maxAttempts: number; batchSize: number; retryDelayMs: number; claimDurationMs: number;
  }) {}

  start(intervalMs: number): void {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => { void this.runCycle(); }, intervalMs);
    this.timer.unref();
    void this.runCycle();
    deliveryLogger.info({ actionRunId: randomUUID(), layer: "server", stage: "server.notify.started", intervalMs }, "MESSAGE_DELIVERY_STARTED");
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.active;
  }

  runCycle(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.active) return this.active;
    this.active = this.deliverDue().catch(() => {
      deliveryLogger.error({ actionRunId: randomUUID(), layer: "server", stage: "server.notify.cycle_failed",
        errorCode: "MESSAGE_DELIVERY_CYCLE_FAILED" }, "MESSAGE_DELIVERY_CYCLE_FAILED");
    }).finally(() => { this.active = undefined; });
    return this.active;
  }

  private async deliverDue(): Promise<void> {
    const now = new Date().toISOString();
    await this.deps.store.recoverExpired(now);
    const ids = await this.deps.store.listDue(this.deps.maxAttempts, this.deps.batchSize, now);
    for (const id of ids) {
      if (this.stopped) break;
      const message = await this.deps.store.claim(id, this.deps.maxAttempts, this.deps.claimDurationMs, new Date().toISOString());
      if (message) await this.deliver(message);
    }
  }

  private async deliver(message: ClaimedMessage): Promise<void> {
    const context = { actionRunId: `message-${message.id}`, layer: "server", stage: "server.notify.send", attempt: message.attempts };
    let messageId: string | undefined;
    try {
      const result = await this.deps.sender.sendMessageToChat({ chatId: message.chat_id, text: message.text, idempotencyKey: message.idempotency_key });
      messageId = result.messageId;
      await this.deps.store.complete(message, { status: "sent", messageId });
      deliveryLogger.info({ ...context, messageId }, "MESSAGE_SENT");
    } catch (error) {
      const typed = error instanceof Error && "kind" in error ? error as LarkImNotificationError : undefined;
      if (messageId || !typed || typed.kind === "uncertain") {
        await this.deps.store.complete(message, { status: "outcome_unknown", messageId,
          errorCode: messageId ? "MESSAGE_ACK_FAILED" : typed?.errorCode ?? "MESSAGE_SEND_UNKNOWN" });
      } else if (typed.kind === "permanent" || message.attempts >= this.deps.maxAttempts) {
        await this.deps.store.complete(message, { status: "failed", errorCode: typed.errorCode });
      } else {
        const delay = Math.min(this.deps.retryDelayMs * 2 ** message.attempts, 3_600_000);
        await this.deps.store.complete(message, { status: "pending_send", errorCode: typed.errorCode,
          nextAttemptAt: new Date(Date.now() + delay).toISOString() });
      }
      deliveryLogger.warn({ ...context, errorCode: typed?.errorCode ?? "MESSAGE_DELIVERY_FAILED" }, "MESSAGE_DELIVERY_FAILED");
    }
  }
}
