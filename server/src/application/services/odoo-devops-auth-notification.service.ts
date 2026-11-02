import type { OdooDevopsEnvironment } from "../../adapters/odoo-devops/odoo-devops-branches-client.js";
import type { PostgresMessageOutboxStore } from "../../adapters/postgres/message-outbox-store.js";
import type { ResolvedUserStore } from "../../adapters/postgres/resolved-user-store.js";
import { logger } from "../../logger.js";

const notificationLogger = logger.child({ module: "odoo-devops-auth-notification" });

/** One durable alert per configured session and chat; delivery stays in the generic outbox. */
export class OdooDevopsAuthNotificationService {
  private queued = false;

  constructor(private readonly deps: {
    outbox: Pick<PostgresMessageOutboxStore, "enqueue">;
    users: Pick<ResolvedUserStore, "getByGithubId">;
    sessionFingerprint: string;
    chatId: string;
    recipientGithubLogins: string[];
  }) {}

  async notify(input: { actionRunId: string; environments: OdooDevopsEnvironment[] }): Promise<void> {
    if (this.queued || !input.environments.length) return;
    const context = { actionRunId: input.actionRunId, layer: "server", stage: "server.auth_notification.prepare" };
    const logins = [...new Set(this.deps.recipientGithubLogins.map((login) => login.trim().toLowerCase()))];
    const users = await Promise.all(logins.map((login) => this.deps.users.getByGithubId(login)));
    const mentions = new Map<string, string>();
    let unresolvedRecipientCount = 0;
    for (const user of users) {
      if (user?.status === "active" && user.larkId) {
        mentions.set(user.larkId, user.larkName || "通知接收人");
      } else {
        unresolvedRecipientCount += 1;
      }
    }
    if (unresolvedRecipientCount) {
      notificationLogger.warn({ ...context, unresolvedRecipientCount, errorCode: "ODOO_DEVOPS_AUTH_RECIPIENT_UNRESOLVED" }, "ODOO_DEVOPS_AUTH_RECIPIENT_UNRESOLVED");
    }
    const mentionText = [...mentions].map(([openId, name]) => `<at user_id="${escapeLarkText(openId)}">${escapeLarkText(name)}</at>`).join(" ");
    const text = [
      "【Octo / Odoo.sh 登录态失效】",
      ...(mentionText ? [mentionText] : []),
      `环境：${input.environments.map((environment) => environment.toUpperCase()).join(" / ")}`,
      "DevOps 拒绝了当前会话的访问，Octo PR 的 Odoo.sh 构建状态暂时无法更新。",
      "请恢复有效的 DevOps 会话，更新服务器的 ODOO_DEVOPS_SESSION，重启 Octo Server 后复验。",
    ].join("\n");
    await this.deps.outbox.enqueue({
      idempotencyKey: `odoo-devops-auth-required:${this.deps.sessionFingerprint}:${this.deps.chatId}`,
      chatId: this.deps.chatId,
      text,
    });
    this.queued = true;
    notificationLogger.info({ ...context, stage: "server.auth_notification.queued" }, "ODOO_DEVOPS_AUTH_NOTIFICATION_QUEUED");
  }
}

function escapeLarkText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
