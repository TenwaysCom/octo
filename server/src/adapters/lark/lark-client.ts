/**
 * Lark Bitable API Client
 *
 * Uses @larksuiteoapi/node-sdk for official Lark API integration
 * Provides access to Lark Bitable (multidimensional table) records
 * Used for reading A1 support tickets and A2 requirements
 */

import * as lark from "@larksuiteoapi/node-sdk";
import { logger } from "../../logger.js";

const clientLogger = logger.child({ module: "lark-client" });

// ==================== Data Types ====================

export interface LarkBitableRecord {
  record_id: string;
  fields: Record<string, unknown>;
  created_time?: string;
  updated_time?: string;
  shared_url?: string;
}

export interface LarkBitableTable {
  table_id: string;
  name: string;
}

export interface LarkBitableBase {
  base_id: string;
  name: string;
}

// ==================== Error Types ====================

export class LarkAPIError extends Error {
  statusCode?: number;
  response?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode?: number,
    response?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LarkAPIError";
    this.statusCode = statusCode;
    this.response = response;
  }
}

export class LarkAuthenticationError extends LarkAPIError {
  constructor(
    message: string,
    statusCode = 401,
    response?: Record<string, unknown>,
  ) {
    super(message, statusCode, response);
    this.name = "LarkAuthenticationError";
  }
}

export class LarkNotFoundError extends LarkAPIError {
  constructor(
    message: string,
    statusCode = 404,
    response?: Record<string, unknown>,
  ) {
    super(message, statusCode, response);
    this.name = "LarkNotFoundError";
  }
}

// ==================== Client Options ====================

export interface LarkClientOptions {
  accessToken: string;
  baseUrl?: string;
}

export interface BatchGetRecordsOptions {
  withSharedUrl?: boolean;
}

export interface BatchGetRecordsResult {
  records: LarkBitableRecord[];
  forbidden_record_ids: string[];
  absent_record_ids: string[];
}

// ==================== LarkClient Class ====================

export class LarkClient {
  private client: lark.Client;
  private accessToken: string;
  private baseUrl: string;

  constructor(options: LarkClientOptions) {
    this.accessToken = options.accessToken;
    this.baseUrl = options.baseUrl || "https://open.feishu.cn";

    // Initialize with dummy credentials - we'll use user token directly
    this.client = new lark.Client({
      appId: "dummy",
      appSecret: "dummy",
      appType: lark.AppType.SelfBuild,
      domain: this.baseUrl.includes("feishu") ? lark.Domain.Feishu : lark.Domain.Lark,
    });
  }

  // ==================== Generic Request Method ====================

  private async request<T>(
    method: string,
    url: string,
    data?: Record<string, unknown>,
    params?: Record<string, unknown>,
  ): Promise<T> {
    clientLogger.debug({ method, url, params }, "LARK_REQUEST_START");
    try {
      const response = await this.client.request({
        method: method as "GET" | "POST" | "PUT" | "DELETE",
        url,
        data,
        params,
      }, lark.withUserAccessToken(this.accessToken));

      if (response.code !== 0) {
        clientLogger.warn({ method, url, code: response.code, msg: response.msg, data: response.data }, "LARK_REQUEST_ERROR");
        throw this.createError(response.msg, response.code, response.data);
      }

      return response.data as T;
    } catch (error) {
      const axiosError = error as {
        message?: string;
        response?: {
          status?: number;
          data?: Record<string, unknown>;
        };
      };
      const httpStatus = axiosError.response?.status;
      const responseData = axiosError.response?.data;
      clientLogger.warn(
        {
          method,
          url,
          httpStatus,
          responseData,
          error: error instanceof Error ? error.message : String(error),
        },
        "LARK_REQUEST_CATCH",
      );
      throw this.handleRequestError(error);
    }
  }

  // ==================== Bitable App Methods ====================

  /**
   * Get list of bases (apps)
   */
  async getBases(pageToken?: string, pageSize = 50): Promise<{ items: LarkBitableBase[]; hasMore: boolean; nextPageToken?: string }> {
    const data = await this.request<{
      items: Array<{ app_id: string; name: string }>;
      has_more: boolean;
      page_token?: string;
    }>("GET", "/open-apis/bitable/v1/apps", undefined, {
      page_size: pageSize,
      page_token: pageToken,
    });

    const items = data.items || [];

    return {
      items: items.map((item) => ({
        base_id: item.app_id,
        name: item.name,
      })),
      hasMore: data.has_more,
      nextPageToken: data.page_token,
    };
  }

  /**
   * Get base info
   */
  async getBaseInfo(baseId: string): Promise<LarkBitableBase> {
    const data = await this.request<{ app_id: string; name: string }>(
      "GET",
      `/open-apis/bitable/v1/apps/${baseId}`,
    );

    return {
      base_id: data.app_id || baseId,
      name: data.name || "",
    };
  }

  // ==================== Bitable Table Methods ====================

  /**
   * Get list of tables in a base
   */
  async getTables(baseId: string): Promise<LarkBitableTable[]> {
    const data = await this.request<{
      items: Array<{ table_id: string; name: string }>;
    }>("GET", `/open-apis/bitable/v1/apps/${baseId}/tables`);

    return (data.items || []).map((item) => ({
      table_id: item.table_id,
      name: item.name,
    }));
  }

  // ==================== Bitable Record Methods ====================

  /**
   * Get record by ID
   */
  async getRecord(baseId: string, tableId: string, recordId: string): Promise<LarkBitableRecord> {
    const data = await this.request<{
      record?: {
        record_id: string;
        fields: Record<string, unknown>;
        created_time?: string;
        updated_time?: string;
        shared_url?: string;
      };
    }>("GET", `/open-apis/bitable/v1/apps/${baseId}/tables/${tableId}/records/${recordId}`);

    clientLogger.debug({ baseId, tableId, recordId }, "GET_RECORD raw response");

    return this.mapRecord(data.record, recordId);
  }

  /**
   * List records with filtering and pagination
   */
  async listRecords(
    baseId: string,
    tableId: string,
    options?: {
      pageNum?: number;
      pageSize?: number;
      filter?: string;
      sort?: string;
    },
  ): Promise<{ records: LarkBitableRecord[]; hasMore: boolean; nextPageToken?: string }> {
    const { pageNum = 1, pageSize = 50 } = options || {};

    const data = await this.request<{
      items: Array<{
        record_id: string;
        fields: Record<string, unknown>;
        created_time?: string;
        updated_time?: string;
        shared_url?: string;
      }>;
      has_more: boolean;
      page_token?: string;
    }>("GET", `/open-apis/bitable/v1/apps/${baseId}/tables/${tableId}/records`, undefined, {
      page_size: pageSize,
      page_num: pageNum,
      filter: options?.filter,
      sort: options?.sort,
    });

    const records = (data.items || []).map((item) => this.mapRecord(item));

    return {
      records,
      hasMore: data.has_more,
      nextPageToken: data.page_token,
    };
  }

  /**
   * List records from a specific view via bitable/v1.
   */
  async listRecordsByView(
    baseId: string,
    tableId: string,
    viewId: string,
    options?: {
      pageSize?: number;
      pageToken?: string;
    },
  ): Promise<{ records: LarkBitableRecord[]; hasMore: boolean; nextPageToken?: string }> {
    const data = await this.request<{
      items: Array<{
        record_id: string;
        fields: Record<string, unknown>;
        created_time?: string;
        updated_time?: string;
        shared_url?: string;
      }>;
      has_more: boolean;
      page_token?: string;
    }>("GET", `/open-apis/bitable/v1/apps/${baseId}/tables/${tableId}/records`, undefined, {
      view_id: viewId,
      page_size: options?.pageSize ?? 100,
      page_token: options?.pageToken,
    });

    return {
      records: (data.items || []).map((item) => this.mapRecord(item)),
      hasMore: data.has_more,
      nextPageToken: data.page_token,
    };
  }

  /**
   * Create a new record
   */
  async createRecord(
    baseId: string,
    tableId: string,
    fields: Record<string, unknown>,
  ): Promise<LarkBitableRecord> {
    const data = await this.request<{
      record?: {
        record_id: string;
        fields: Record<string, unknown>;
        shared_url?: string;
      };
    }>("POST", `/open-apis/bitable/v1/apps/${baseId}/tables/${tableId}/records`, {
      fields,
    });

    return this.mapRecord(data.record);
  }

  /**
   * Update a record
   */
  async updateRecord(
    baseId: string,
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<LarkBitableRecord> {
    const data = await this.request<{
      record?: {
        record_id: string;
        fields: Record<string, unknown>;
        shared_url?: string;
      };
    }>("PUT", `/open-apis/bitable/v1/apps/${baseId}/tables/${tableId}/records/${recordId}`, {
      fields,
    });

    return this.mapRecord(data.record, recordId);
  }

  /**
   * Delete a record
   */
  async deleteRecord(baseId: string, tableId: string, recordId: string): Promise<void> {
    await this.request<void>(
      "DELETE",
      `/open-apis/bitable/v1/apps/${baseId}/tables/${tableId}/records/${recordId}`,
    );
  }

  /**
   * Batch get records
   */
  async batchGetRecords(
    baseId: string,
    tableId: string,
    recordIds: string[],
    options?: BatchGetRecordsOptions,
  ): Promise<BatchGetRecordsResult> {
    const data = await this.request<{
      records?: Array<{
        record_id: string;
        fields: Record<string, unknown>;
        created_time?: string;
        updated_time?: string;
        shared_url?: string;
      }>;
      forbidden_record_ids?: string[];
      absent_record_ids?: string[];
    }>(
      "POST",
      `/open-apis/bitable/v1/apps/${baseId}/tables/${tableId}/records/batch_get`,
      {
        record_ids: recordIds,
        with_shared_url: options?.withSharedUrl,
      },
    );

    return {
      records: (data.records || []).map((record) => this.mapRecord(record)),
      forbidden_record_ids: data.forbidden_record_ids || [],
      absent_record_ids: data.absent_record_ids || [],
    };
  }

  // ==================== IM Message Methods ====================

  /**
   * Send a message to a chat
   */
  async sendMessage(
    receiveIdType: "open_id" | "user_id" | "union_id" | "email" | "chat_id",
    receiveId: string,
    msgType: "text" | "post" | "image" | "file" | "interactive",
    content: string,
  ): Promise<{ message_id: string }> {
    const data = await this.request<{
      message_id?: string;
    }>("POST", "/open-apis/im/v1/messages", {
      receive_id: receiveId,
      msg_type: msgType,
      content,
    }, {
      receive_id_type: receiveIdType,
    });

    return {
      message_id: data.message_id || "",
    };
  }

  /**
   * Reply to a specific message
   */
  async replyToMessage(
    messageId: string,
    msgType: "text" | "post" | "image" | "file" | "interactive",
    content: string,
    options?: { reply_in_thread?: boolean },
  ): Promise<{ message_id: string }> {
    const data = await this.request<{
      message_id?: string;
    }>("POST", `/open-apis/im/v1/messages/${messageId}/reply`, {
      msg_type: msgType,
      content,
      reply_in_thread: options?.reply_in_thread ?? false,
    });

    return {
      message_id: data.message_id || "",
    };
  }

  /**
   * Get a message by ID
   */
  async getMessage(messageId: string): Promise<{ message_id: string; content?: string }> {
    const data = await this.request<{
      message_id?: string;
      content?: string;
    }>("GET", `/open-apis/im/v1/messages/${messageId}`);

    return {
      message_id: data.message_id || "",
      content: data.content,
    };
  }

  /**
   * Get messages in a thread
   */
  async getThreadMessages(threadId: string): Promise<{
    items: Array<{
      message_id: string;
      root_id?: string;
      content?: string;
    }>;
    hasMore: boolean;
    pageToken?: string;
  }> {
    const data = await this.request<{
      items?: Array<{
        message_id?: string;
        root_id?: string;
        body?: { content?: string };
      }>;
      has_more?: boolean;
      page_token?: string;
    }>("GET", "/open-apis/im/v1/messages", undefined, {
      container_id_type: "thread",
      container_id: threadId,
      page_size: 50,
    });

    return {
      items: (data.items || []).map((item) => ({
        message_id: item.message_id || "",
        root_id: item.root_id,
        content: item.body?.content,
      })),
      hasMore: data.has_more ?? false,
      pageToken: data.page_token,
    };
  }

  /**
   * Add a reaction to a message
   */
  async addMessageReaction(messageId: string, emojiType: string): Promise<void> {
    await this.request<void>("POST", `/open-apis/im/v1/messages/${messageId}/reactions`, {
      reaction_type: {
        emoji_type: emojiType,
      },
    });
  }

  // ==================== Error Handling ====================

  private createError(
    message: string,
    statusCode?: number,
    response?: Record<string, unknown>,
  ): LarkAPIError {
    if (statusCode === 99991004 || statusCode === 401) {
      return new LarkAuthenticationError(message, statusCode, response);
    }

    if (statusCode === 99991002 || statusCode === 404) {
      return new LarkNotFoundError(message, statusCode, response);
    }

    return new LarkAPIError(message, statusCode, response);
  }

  private handleRequestError(error: unknown): LarkAPIError {
    if (error instanceof LarkAPIError) {
      return error;
    }

    const axiosError = error as {
      message?: string;
      response?: {
        status?: number;
        data?: Record<string, unknown>;
      };
    };

    const responseData = axiosError.response?.data;
    const statusCode =
      (typeof responseData?.code === "number" ? responseData.code : undefined) ??
      axiosError.response?.status;
    const message =
      (typeof responseData?.msg === "string" ? responseData.msg : undefined) ??
      (typeof responseData?.error === "string" ? responseData.error : undefined) ??
      axiosError.message ??
      "Lark API request failed";

    return this.createError(message, statusCode, responseData);
  }

  private mapRecord(
    record?: {
      record_id?: string;
      fields?: Record<string, unknown>;
      created_time?: string;
      updated_time?: string;
      shared_url?: string;
    },
    fallbackRecordId = "",
  ): LarkBitableRecord {
    return {
      record_id: record?.record_id || fallbackRecordId,
      fields: record?.fields || {},
      created_time: record?.created_time,
      updated_time: record?.updated_time,
      shared_url: record?.shared_url,
    };
  }
}
