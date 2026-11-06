import type { LarkClient } from "../../adapters/lark/lark-client.js";
import { classifyLarkRecordError } from "../../adapters/lark/lark-client.js";
import { logger } from "../../logger.js";
import {
  PostgresPlatformSyncStore,
  type PlatformSyncStore,
} from "../../adapters/postgres/platform-sync-store.js";
import {
  buildAuthenticatedLarkClient,
  type AuthenticatedLarkClientFactoryDeps,
} from "./lark-auth-client.factory.js";

export interface LarkTicketRef {
  baseId: string;
  tableId: string;
  recordId: string;
}

export class LarkTicketError extends Error {
  constructor(
    readonly code: "LARK_TICKET_NOT_FOUND" | "LARK_TICKET_SHARED_URL_NOT_FOUND" | "LARK_TICKET_SOURCE_NOT_FOUND"
      | "LARK_TICKET_SOURCE_FORBIDDEN" | "LARK_AUTH_REQUIRED" | "LARK_TICKET_SOURCE_RESOURCE_NOT_FOUND" | "LARK_TICKET_DELETED",
    message: string,
    readonly statusCode = 404,
  ) {
    super(message);
  }
}

export function toLarkTicketSourceError(error: unknown): LarkTicketError | undefined {
  switch (classifyLarkRecordError(error)) {
    case "record-not-found": return new LarkTicketError("LARK_TICKET_SOURCE_NOT_FOUND", "Lark Base 源记录不存在，可能已被删除。Octo 仍保留历史数据，可核对后标记删除。", 404);
    case "forbidden": return new LarkTicketError("LARK_TICKET_SOURCE_FORBIDDEN", "没有访问或修改该 Lark Base 记录的权限，请联系 Base 管理员检查记录及应用权限。", 403);
    case "auth-required": return new LarkTicketError("LARK_AUTH_REQUIRED", "Lark 授权不可用，请重新授权后重试。", 401);
    case "resource-not-found": return new LarkTicketError("LARK_TICKET_SOURCE_RESOURCE_NOT_FOUND", "Lark Base 或数据表不存在，请检查来源配置及访问权限。", 404);
    default: return undefined;
  }
}

export interface LarkTicketServiceDeps extends AuthenticatedLarkClientFactoryDeps {
  syncStore?: Pick<PlatformSyncStore, "getLarkBaseTicketsForCleaning" | "setLarkBaseTicketSharedUrl">
    & Partial<Pick<PlatformSyncStore, "markLarkBaseTicketDeleted">>;
  createLarkClient?: (accessToken: string, baseUrl?: string) => LarkClient;
}

export function createLarkTicketService(
  deps: LarkTicketServiceDeps = {},
) {
  const getSyncStore = () => deps.syncStore ?? new PostgresPlatformSyncStore();

  return {
    async loadSharedUrl(input: {
      masterUserId: string;
      larkBaseUrl: string;
      ticket: LarkTicketRef;
      actionRunId?: string;
    }): Promise<{ sharedUrl: string }> {
      const syncStore = getSyncStore();
      const [ticket] = await syncStore.getLarkBaseTicketsForCleaning([input.ticket]);
      if (!ticket) {
        throw new LarkTicketError("LARK_TICKET_NOT_FOUND", "The requested Lark Ticket is not available in the synchronized snapshot.");
      }
      if (ticket.deletedAt) throw new LarkTicketError("LARK_TICKET_DELETED", "此 Ticket 已在 Octo 标记删除。", 409);
      if (ticket.sharedUrl) {
        return { sharedUrl: ticket.sharedUrl };
      }

      try {
        const { client } = await buildAuthenticatedLarkClient(input.masterUserId, input.larkBaseUrl, { ...deps, actionRunId: input.actionRunId });
        const result = await client.batchGetRecords(
          input.ticket.baseId, input.ticket.tableId, [input.ticket.recordId], { withSharedUrl: true },
        );
        if (result.forbidden_record_ids.includes(input.ticket.recordId)) {
          throw new LarkTicketError("LARK_TICKET_SOURCE_FORBIDDEN", "没有访问该 Lark Base 记录的权限，请联系 Base 管理员检查记录及应用权限。", 403);
        }
        if (result.absent_record_ids.includes(input.ticket.recordId)) {
          throw new LarkTicketError("LARK_TICKET_SOURCE_NOT_FOUND", "Lark Base 源记录不存在，可能已被删除。Octo 仍保留历史数据，可核对后标记删除。", 404);
        }
        const sharedUrl = result.records.find((record) => record.record_id === input.ticket.recordId)?.shared_url;
        if (!sharedUrl) {
          throw new LarkTicketError("LARK_TICKET_SHARED_URL_NOT_FOUND", "Lark 未返回此 Ticket 的共享链接，请检查授权及记录访问权限后重试。");
        }

        await syncStore.setLarkBaseTicketSharedUrl({ ...input.ticket, sharedUrl });
        return { sharedUrl };
      } catch (error) { throw toLarkTicketSourceError(error) ?? error; }
    },

    async markDeleted(input: { ticket: LarkTicketRef; masterUserId: string; actionRunId: string }) {
      const store = getSyncStore();
      const [ticket] = await store.getLarkBaseTicketsForCleaning([input.ticket]);
      if (!ticket) throw new LarkTicketError("LARK_TICKET_NOT_FOUND", "Octo 中未找到此 Ticket。");
      if (!store.markLarkBaseTicketDeleted) throw new Error("Ticket deletion store unavailable");
      const result = await store.markLarkBaseTicketDeleted({ ...input.ticket, deletedBy: input.masterUserId });
      logger.info({ actionRunId: input.actionRunId, layer: "server", module: "lark-ticket", stage: "server.ticket.mark-deleted", ...input.ticket }, "server.ticket.mark-deleted");
      return result;
    },
  };
}
