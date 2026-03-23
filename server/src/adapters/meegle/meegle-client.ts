/**
 * Meegle OpenAPI Client
 *
 * TypeScript implementation based on meegle_clients Python reference
 * Provides workitem CRUD, catalog discovery, and user operations
 */

// ==================== Data Types ====================

export interface MeegleUser {
  user_key: string;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
}

export interface MeegleWorkitem {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
  assignee?: string;
  fields: Record<string, unknown>;
}

export interface MeegleComment {
  id: string;
  content: string;
  author: string;
  created_at: string;
}

export interface MeegleSpace {
  project_key: string;
  name: string;
  description?: string;
}

// ==================== Error Types ====================

export class MeegleAPIError extends Error {
  statusCode?: number;
  response?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode?: number,
    response?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MeegleAPIError";
    this.statusCode = statusCode;
    this.response = response;
  }
}

export class MeegleAuthenticationError extends MeegleAPIError {
  constructor(
    message: string,
    statusCode = 401,
    response?: Record<string, unknown>,
  ) {
    super(message, statusCode, response);
    this.name = "MeegleAuthenticationError";
  }
}

export class MeegleNotFoundError extends MeegleAPIError {
  constructor(
    message: string,
    statusCode = 404,
    response?: Record<string, unknown>,
  ) {
    super(message, statusCode, response);
    this.name = "MeegleNotFoundError";
  }
}

export class MeegleRateLimitError extends MeegleAPIError {
  constructor(
    message: string,
    statusCode = 429,
    response?: Record<string, unknown>,
  ) {
    super(message, statusCode, response);
    this.name = "MeegleRateLimitError";
  }
}

export class MeegleValidationError extends MeegleAPIError {
  constructor(
    message: string,
    statusCode = 422,
    response?: Record<string, unknown>,
  ) {
    super(message, statusCode, response);
    this.name = "MeegleValidationError";
  }
}

// ==================== Client Options ====================

export interface MeegleClientOptions {
  userToken: string;
  userKey: string;
  baseUrl?: string;
  timeout?: number;
}

// ==================== Utility Functions ====================

function joinUrl(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

function generateIdemUUID(): string {
  return crypto.randomUUID();
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return { text: await response.text() };
  }
}

function handleResponse(response: Response, data: Record<string, unknown>): Record<string, unknown> {
  if (!response.ok) {
    const error_msg = (data.message || data.error || `HTTP ${response.status}`) as string;

    if (response.status === 401) {
      throw new MeegleAuthenticationError(error_msg, response.status, data);
    } else if (response.status === 404) {
      throw new MeegleNotFoundError(error_msg, response.status, data);
    } else if (response.status === 429) {
      throw new MeegleRateLimitError(error_msg, response.status, data);
    } else if (response.status === 422) {
      throw new MeegleValidationError(error_msg, response.status, data);
    } else {
      throw new MeegleAPIError(error_msg, response.status, data);
    }
  }

  return data;
}

// ==================== Data Transformers ====================

function parseUser(data: Record<string, unknown>): MeegleUser {
  return {
    user_key: String(data.user_key || ""),
    name: String(data.name || ""),
    email: String(data.email || ""),
    avatar: data.avatar as string | undefined,
    role: data.role as string | undefined,
  };
}

function parseWorkitem(data: Record<string, unknown>): MeegleWorkitem {
  const id = String(data.id || data.work_item_id || "");
  const key = String(data.key || data.work_item_key || "");
  const name = String(data.name || data.title || "");
  const type = String(data.type || data.work_item_type_key || "");
  const status = String(data.status || data.state || "");
  const assignee = (data.assignee || data.owner) as string | undefined;

  // Extract other fields
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!["id", "key", "name", "title", "type", "work_item_type_key", "status", "state", "assignee", "owner"].includes(k)) {
      fields[k] = v;
    }
  }

  return { id, key, name, type, status, assignee, fields };
}

function parseComment(data: Record<string, unknown>): MeegleComment {
  const authorData = data.author;
  let author = "";
  if (typeof authorData === "object" && authorData !== null) {
    author = String((authorData as Record<string, unknown>).name || (authorData as Record<string, unknown>).displayName || "");
  } else {
    author = String(authorData || "");
  }

  const created_at = String(data.created_at || data.created || data.createdAt || "");

  return {
    id: String(data.id || ""),
    content: String(data.content || data.body || ""),
    author,
    created_at,
  };
}

function parseSpace(data: Record<string, unknown>): MeegleSpace {
  return {
    project_key: String(data.project_key || data.key || ""),
    name: String(data.name || ""),
    description: data.description as string | undefined,
  };
}

function parseItemsList(data: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data as Record<string, unknown>[];
  }
  if (typeof data === "object" && data !== null) {
    for (const key of keys) {
      const items = (data as Record<string, unknown>)[key];
      if (Array.isArray(items)) {
        return items as Record<string, unknown>[];
      }
    }
  }
  return [];
}

// ==================== MeegleClient Class ====================

export class MeegleClient {
  private userToken: string;
  private userKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(options: MeegleClientOptions) {
    this.userToken = options.userToken;
    this.userKey = options.userKey;
    this.baseUrl = options.baseUrl || "https://www.meegle.com";
    this.timeout = options.timeout || 30000;
  }

  private getHeaders(idempotent = false): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-USER-TOKEN": this.userToken,
      "X-USER-KEY": this.userKey,
    };

    if (idempotent) {
      headers["X-IDEM-UUID"] = generateIdemUUID();
    }

    return headers;
  }

  private async get(endpoint: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = joinUrl(this.baseUrl, endpoint);
    const searchParams = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
    }

    const fullUrl = searchParams.toString() ? `${url}?${searchParams.toString()}` : url;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(fullUrl, {
        method: "GET",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await parseJson(response);
      return handleResponse(response, data);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new MeegleAPIError("Request timeout", 408);
      }
      throw err;
    }
  }

  private async post(
    endpoint: string,
    data?: Record<string, unknown>,
    idempotent = false,
  ): Promise<Record<string, unknown>> {
    const url = joinUrl(this.baseUrl, endpoint);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(idempotent),
        body: JSON.stringify(data || {}),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseData = await parseJson(response);
      return handleResponse(response, responseData);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new MeegleAPIError("Request timeout", 408);
      }
      throw err;
    }
  }

  private async put(
    endpoint: string,
    data?: Record<string, unknown>,
    idempotent = false,
  ): Promise<Record<string, unknown>> {
    const url = joinUrl(this.baseUrl, endpoint);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: this.getHeaders(idempotent),
        body: JSON.stringify(data || {}),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseData = await parseJson(response);
      return handleResponse(response, responseData);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new MeegleAPIError("Request timeout", 408);
      }
      throw err;
    }
  }

  private async delete(endpoint: string, idempotent = false): Promise<Record<string, unknown>> {
    const url = joinUrl(this.baseUrl, endpoint);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: this.getHeaders(idempotent),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await parseJson(response);
      return handleResponse(response, data);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new MeegleAPIError("Request timeout", 408);
      }
      throw err;
    }
  }

  // ==================== Space/Project Methods ====================

  async getSpaces(userKey?: string): Promise<MeegleSpace[]> {
    const payload = { user_key: userKey || this.userKey };
    const data = await this.post("/open_api/projects", payload);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseSpace);
  }

  async getSpaceDetails(projectKeys: string[], userKey?: string): Promise<MeegleSpace[]> {
    const payload = {
      project_keys: projectKeys,
      user_key: userKey || this.userKey,
    };
    const data = await this.post("/open_api/projects/detail", payload);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseSpace);
  }

  async getBusinessLines(projectKey: string): Promise<Record<string, unknown>[]> {
    const data = await this.get(`/open_api/${projectKey}/business/all`);
    const result = data.data ?? data;
    return Array.isArray(result) ? result : [];
  }

  async getWorkitemTypes(projectKey: string): Promise<Record<string, unknown>[]> {
    const data = await this.get(`/open_api/${projectKey}/work_item/all-types`);
    const result = data.data ?? data;
    return Array.isArray(result) ? result : [];
  }

  // ==================== User Methods ====================

  async getUsers(userKeys: string[]): Promise<MeegleUser[]> {
    const payload = { user_keys: userKeys };
    const data = await this.post("/open_api/user/query", payload);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseUser);
  }

  // ==================== Workitem Methods ====================

  async createWorkitem(
    projectKey: string,
    workitemTypeKey: string,
    name: string,
    options?: {
      templateId?: number;
      fieldValuePairs?: Array<{ fieldKey: string; fieldValue: unknown }>;
    },
  ): Promise<MeegleWorkitem> {
    const endpoint = `/open_api/${projectKey}/work_item/create`;
    const payload: Record<string, unknown> = {
      work_item_type_key: workitemTypeKey,
      name: name,
    };

    if (options?.templateId) {
      payload.template_id = options.templateId;
    }

    if (options?.fieldValuePairs) {
      payload.field_value_pairs = options.fieldValuePairs;
    }

    const data = await this.post(endpoint, payload, true);
    const workitemData = (data.data ?? data) as Record<string, unknown>;
    return parseWorkitem(workitemData);
  }

  async updateWorkitem(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    updateFields: Array<{ fieldKey: string; fieldValue: unknown }>,
  ): Promise<MeegleWorkitem> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/${workitemId}`;
    const payload = { update_fields: updateFields };
    const data = await this.put(endpoint, payload, true);
    const workitemData = (data.data ?? data) as Record<string, unknown>;
    return parseWorkitem(workitemData);
  }

  async deleteWorkitem(
    projectKey: string,
    workitemType: string,
    workitemId: string,
  ): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/${workitemId}`;
    return this.delete(endpoint, true);
  }

  async abortWorkitem(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    isAborted: boolean,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/${workitemId}/abort`;
    const payload: Record<string, unknown> = { is_aborted: isAborted };
    if (reason) {
      payload.reason = reason;
    }
    return this.put(endpoint, payload, true);
  }

  async getWorkitemDetails(
    projectKey: string,
    workitemType: string,
    workitemIds: string[],
  ): Promise<MeegleWorkitem[]> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/query`;
    const payload = { work_item_ids: workitemIds };
    const data = await this.post(endpoint, payload);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseWorkitem);
  }

  async filterWorkitems(
    projectKey: string,
    options?: {
      workitemTypeKeys?: string[];
      pageNum?: number;
      pageSize?: number;
      autoPaginate?: boolean;
    },
  ): Promise<MeegleWorkitem[]> {
    const {
      workitemTypeKeys,
      pageNum = 1,
      pageSize = 50,
      autoPaginate = false,
    } = options || {};

    if (autoPaginate) {
      return this.filterWorkitemsPaginated(projectKey, workitemTypeKeys, pageSize);
    }

    return this.filterWorkitemsSinglePage(projectKey, workitemTypeKeys, pageNum, pageSize);
  }

  private async filterWorkitemsSinglePage(
    projectKey: string,
    workitemTypeKeys?: string[],
    pageNum = 1,
    pageSize = 50,
  ): Promise<MeegleWorkitem[]> {
    const endpoint = `/open_api/${projectKey}/work_item/filter`;
    const payload: Record<string, unknown> = {
      page_num: pageNum,
      page_size: pageSize,
    };
    if (workitemTypeKeys) {
      payload.work_item_type_keys = workitemTypeKeys;
    }

    const data = await this.post(endpoint, payload);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseWorkitem);
  }

  private async filterWorkitemsPaginated(
    projectKey: string,
    workitemTypeKeys?: string[],
    pageSize = 50,
    maxPages = 100,
  ): Promise<MeegleWorkitem[]> {
    const allWorkitems: MeegleWorkitem[] = [];
    let pageNum = 1;

    while (pageNum <= maxPages) {
      const workitems = await this.filterWorkitemsSinglePage(
        projectKey,
        workitemTypeKeys,
        pageNum,
        pageSize,
      );

      if (workitems.length === 0) {
        break;
      }

      allWorkitems.push(...workitems);

      if (workitems.length < pageSize) {
        break;
      }

      pageNum++;
    }

    return allWorkitems;
  }

  async filterWorkitemsAcrossProjects(
    workitemTypeKey: string,
    options?: {
      simpleNames?: string[];
      pageNum?: number;
      pageSize?: number;
    },
  ): Promise<MeegleWorkitem[]> {
    const { simpleNames, pageNum = 1, pageSize = 50 } = options || {};

    const endpoint = "/open_api/work_items/filter_across_project";
    const payload: Record<string, unknown> = {
      work_item_type_key: workitemTypeKey,
      page_num: pageNum,
      page_size: pageSize,
    };
    if (simpleNames) {
      payload.simple_names = simpleNames;
    }

    const data = await this.post(endpoint, payload);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseWorkitem);
  }

  async getWorkitemMeta(projectKey: string, workitemType: string): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/meta`;
    const data = await this.get(endpoint);
    return (data.data ?? data) as Record<string, unknown>;
  }

  // ==================== Workflow Methods ====================

  async getWorkflowDetails(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    flowType = 0,
  ): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/${workitemId}/workflow/query`;
    const payload = { flow_type: flowType };
    const data = await this.post(endpoint, payload);
    return (data.data ?? data) as Record<string, unknown>;
  }

  async getWbsView(
    projectKey: string,
    workitemType: string,
    workitemId: string,
  ): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/${workitemId}/wbs_view`;
    const data = await this.get(endpoint);
    return (data.data ?? data) as Record<string, unknown>;
  }

  async operateWorkflowNode(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    nodeId: string,
    action: string,
  ): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/workflow/${workitemType}/${workitemId}/node/${nodeId}/operate`;
    const payload = { action };
    return this.post(endpoint, payload, true);
  }

  async updateWorkflowNode(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    nodeId: string,
    options?: {
      nodeOwners?: string[];
      nodeSchedule?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/workflow/${workitemType}/${workitemId}/node/${nodeId}`;
    const payload: Record<string, unknown> = {};
    if (options?.nodeOwners) {
      payload.node_owners = options.nodeOwners;
    }
    if (options?.nodeSchedule) {
      payload.node_schedule = options.nodeSchedule;
    }
    return this.put(endpoint, payload, true);
  }

  async changeWorkflowState(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    transitionId: number,
  ): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/workflow/${workitemType}/${workitemId}/node/state_change`;
    const payload = { transition_id: transitionId };
    return this.post(endpoint, payload, true);
  }

  // ==================== Task Methods ====================

  async createTask(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    name: string,
    options?: {
      nodeId?: string;
      note?: string;
      schedule?: Record<string, unknown>;
      roleAssignee?: Record<string, unknown>[];
    },
  ): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/${workitemId}/workflow/task`;
    const payload: Record<string, unknown> = { name };
    if (options?.nodeId) {
      payload.node_id = options.nodeId;
    }
    if (options?.note) {
      payload.note = options.note;
    }
    if (options?.schedule) {
      payload.schedule = options.schedule;
    }
    if (options?.roleAssignee) {
      payload.role_assignee = options.roleAssignee;
    }
    return this.post(endpoint, payload, true);
  }

  async getTasks(
    projectKey: string,
    workitemType: string,
    workitemId: string,
  ): Promise<Record<string, unknown>[]> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/${workitemId}/workflow/task`;
    const data = await this.get(endpoint);
    const result = data.data ?? data;
    return Array.isArray(result) ? result : [];
  }

  async updateTask(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    nodeId: string,
    taskId: string,
    options?: {
      name?: string;
      note?: string;
      schedule?: Record<string, unknown>;
      roleAssignee?: Record<string, unknown>[];
    },
  ): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/${workitemId}/workflow/${nodeId}/task/${taskId}`;
    const payload: Record<string, unknown> = {};
    if (options?.name) {
      payload.name = options.name;
    }
    if (options?.note) {
      payload.note = options.note;
    }
    if (options?.schedule) {
      payload.schedule = options.schedule;
    }
    if (options?.roleAssignee) {
      payload.role_assignee = options.roleAssignee;
    }
    return this.post(endpoint, payload, true);
  }

  // ==================== View Methods ====================

  async getViewWorkitems(projectKey: string, viewId: string): Promise<MeegleWorkitem[]> {
    const endpoint = `/open_api/${projectKey}/fix_view/${viewId}`;
    const data = await this.get(endpoint);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseWorkitem);
  }

  async updateFixedView(
    projectKey: string,
    viewId: string,
    addWorkItemIds: number[],
  ): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/story/fix_view/${viewId}`;
    const payload = { add_work_item_ids: addWorkItemIds };
    return this.post(endpoint, payload, true);
  }

  async deleteFixedView(projectKey: string, viewId: string): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/fix_view/${viewId}`;
    return this.delete(endpoint, true);
  }

  async createFixedView(
    projectKey: string,
    name: string,
    workItemIdList: number[],
  ): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/story/fix_view`;
    const payload = {
      name,
      work_item_id_list: workItemIdList,
    };
    return this.post(endpoint, payload, true);
  }

  async listViews(
    projectKey: string,
    workitemTypeKey: string,
    options?: {
      createdBy?: string;
      createdAtStart?: number;
      createdAtEnd?: number;
      pageNum?: number;
      pageSize?: number;
    },
  ): Promise<Record<string, unknown>[]> {
    const {
      createdBy,
      createdAtStart,
      createdAtEnd,
      pageNum = 1,
      pageSize = 10,
    } = options || {};

    const endpoint = `/open_api/${projectKey}/view_conf/list`;
    const payload: Record<string, unknown> = {
      work_item_type_key: workitemTypeKey,
      page_num: pageNum,
      page_size: pageSize,
    };
    if (createdBy) {
      payload.created_by = createdBy;
    }
    if (createdAtStart || createdAtEnd) {
      payload.created_at = {} as Record<string, unknown>;
      if (createdAtStart) {
        (payload.created_at as Record<string, unknown>).start = createdAtStart;
      }
      if (createdAtEnd) {
        (payload.created_at as Record<string, unknown>).end = createdAtEnd;
      }
    }

    const data = await this.post(endpoint, payload);
    const result = data.data ?? data;
    return Array.isArray(result) ? result : [];
  }

  // ==================== Comment Methods ====================

  async addComment(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    content: string,
  ): Promise<MeegleComment> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/${workitemId}/comment/create`;
    const payload = { content };
    const data = await this.post(endpoint, payload, true);
    const commentData = (data.data ?? data) as Record<string, unknown>;
    return parseComment(commentData);
  }

  async getComments(
    projectKey: string,
    workitemType: string,
    workitemId: string,
  ): Promise<MeegleComment[]> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/${workitemId}/comments`;
    const data = await this.get(endpoint);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseComment);
  }

  async updateComment(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    commentId: string,
    content: string,
  ): Promise<MeegleComment> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/${workitemId}/comment/${commentId}`;
    const payload = { content };
    const data = await this.put(endpoint, payload, true);
    const commentData = (data.data ?? data) as Record<string, unknown>;
    return parseComment(commentData);
  }

  async deleteComment(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    commentId: string,
  ): Promise<Record<string, unknown>> {
    const endpoint = `/open_api/${projectKey}/work_item/${workitemType}/${workitemId}/comment/${commentId}`;
    return this.delete(endpoint);
  }

  // ==================== Field Methods ====================

  async getFields(projectKey: string): Promise<Record<string, unknown>[]> {
    const endpoint = `/open_api/${projectKey}/field/all`;
    const data = await this.post(endpoint, {} as Record<string, unknown>);
    const result = data.data ?? data;
    return Array.isArray(result) ? result : [];
  }

  // ==================== Workflow Template Methods ====================

  async getWorkflowTemplates(
    projectKey: string,
    workitemType: string,
  ): Promise<Record<string, unknown>[]> {
    const endpoint = `/open_api/${projectKey}/template_list/${workitemType}`;
    const data = await this.get(endpoint);
    const result = data.data ?? data;
    return Array.isArray(result) ? result : [];
  }
}
