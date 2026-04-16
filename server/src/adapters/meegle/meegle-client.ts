import { logger } from "../../logger.js";

const clientLogger = logger.child({ module: "meegle-client" });

/**
 * Meegle OpenAPI Client
 *
 * TypeScript implementation based on project-oapi-sdk-golang
 * Provides workitem CRUD, catalog discovery, and user operations
 *
 * API Paths and patterns follow: github.com/larksuite/project-oapi-sdk-golang
 */

// ==================== API Path Constants ====================
// Based on project-oapi-sdk-golang/service/workitem/api.go

const API_PATH_CREATE_WORKITEM = "/open_api/:project_key/work_item/create";
const API_PATH_UPDATE_WORKITEM = "/open_api/:project_key/work_item/:work_item_type_key/:work_item_id";
const API_PATH_DELETE_WORKITEM = "/open_api/:project_key/work_item/:work_item_type_key/:work_item_id";
const API_PATH_ABORT_WORKITEM = "/open_api/:project_key/work_item/:work_item_type_key/:work_item_id/abort";
const API_PATH_QUERY_WORKITEM = "/open_api/:project_key/work_item/:work_item_type_key/query";
const API_PATH_FILTER_WORKITEM = "/open_api/:project_key/work_item/filter";
const API_PATH_FILTER_WORKITEM_ACROSS_PROJECT = "/open_api/work_items/filter_across_project";
const API_PATH_GET_WORKITEM_META = "/open_api/:project_key/work_item/:work_item_type_key/meta";
const API_PATH_WORKFLOW_QUERY = "/open_api/:project_key/work_item/:work_item_type_key/:work_item_id/workflow/query";
const API_PATH_WBS_VIEW = "/open_api/:project_key/work_item/:work_item_type_key/:work_item_id/wbs_view";
const API_PATH_NODE_OPERATE = "/open_api/:project_key/workflow/:work_item_type_key/:work_item_id/node/:node_id/operate";
const API_PATH_NODE_UPDATE = "/open_api/:project_key/workflow/:work_item_type_key/:work_item_id/node/:node_id";
const API_PATH_NODE_STATE_CHANGE = "/open_api/:project_key/workflow/:work_item_type_key/:work_item_id/node/state_change";
const API_PATH_CREATE_TASK = "/open_api/:project_key/work_item/:work_item_type_key/:work_item_id/workflow/task";
const API_PATH_GET_TASKS = "/open_api/:project_key/work_item/:work_item_type_key/:work_item_id/workflow/task";
const API_PATH_UPDATE_TASK = "/open_api/:project_key/work_item/:work_item_type_key/:work_item_id/workflow/:node_id/task/:task_id";
const API_PATH_GET_SPACES = "/open_api/projects";
const API_PATH_GET_SPACE_DETAILS = "/open_api/projects/detail";
const API_PATH_GET_USERS = "/open_api/user/query";
const API_PATH_GET_VIEWS = "/open_api/:project_key/fix_view/:view_id";
const API_PATH_UPDATE_FIXED_VIEW = "/open_api/:project_key/story/fix_view/:view_id";
const API_PATH_DELETE_FIXED_VIEW = "/open_api/:project_key/fix_view/:view_id";
const API_PATH_CREATE_FIXED_VIEW = "/open_api/:project_key/story/fix_view";
const API_PATH_LIST_VIEWS = "/open_api/:project_key/view_conf/list";
const API_PATH_COMMENT_CREATE = "/open_api/:project_key/work_item/:work_item_type_key/:work_item_id/comment/create";
const API_PATH_COMMENT_LIST = "/open_api/:project_key/work_item/:work_item_type_key/:work_item_id/comments";
const API_PATH_COMMENT_UPDATE = "/open_api/:project_key/work_item/:work_item_type_key/:work_item_id/comment/:comment_id";
const API_PATH_COMMENT_DELETE = "/open_api/:project_key/work_item/:work_item_type_key/:work_item_id/comment/:comment_id";
const API_PATH_GET_FIELDS = "/open_api/:project_key/field/all";
const API_PATH_GET_WORKFLOW_TEMPLATES = "/open_api/:project_key/template_list/:work_item_type";
const API_PATH_GET_BUSINESS_LINES = "/open_api/:project_key/business/all";
const API_PATH_GET_WORKITEM_TYPES = "/open_api/:project_key/work_item/all-types";

// Auth API paths
const API_PATH_GET_AUTH_CODE = "/bff/v2/authen/v1/auth_code";

function replacePathParams(path: string, params: Record<string, string>): string {
  return path.replace(/:(\w+)/g, (match, key) => {
    const value = params[key];
    if (!value) {
      throw new Error(`Missing path parameter: ${key}`);
    }
    return value;
  });
}

// ==================== Data Types ====================

// Based on project-oapi-sdk-golang/service/field/model.go
export interface FieldValuePair {
  field_key: string;
  field_value: unknown;
  target_state?: TargetState;
  field_type_key?: string;
  field_alias?: string;
}

export interface TargetState {
  state_key: string;
  transition_id: number;
}

// Based on project-oapi-sdk-golang/service/common/model.go
export interface UserDetail {
  user_key: string;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
}

// Based on project-oapi-sdk-golang/service/workitem/model.go
export interface WorkItemInfo {
  id: number;
  name: string;
  work_item_type_key: string;
  project_key: string;
  fields: FieldValuePair[];
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
}

export interface Pagination {
  page_num: number;
  page_size: number;
  total: number;
  has_more: boolean;
}

// ==================== Request Builders ====================
// Based on project-oapi-sdk-golang/service/workitem/builder.go pattern

interface ApiReq {
  httpMethod: string;
  apiPath: string;
  body?: Record<string, unknown>;
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;
}

interface MeegleServiceContext {
  baseUrl: string;
  userToken: string;
  userKey: string;
  timeout: number;
}

// CreateWorkitem Request Builder
export interface CreateWorkitemRequest {
  projectKey: string;
  workItemTypeKey: string;
  name: string;
  templateId?: number;
  fieldValuePairs?: FieldValuePair[];
  idempotencyKey?: string;
}

function createWorkitemRequestBuilder(input: CreateWorkitemRequest): ApiReq {
  const req: ApiReq = {
    httpMethod: "POST",
    apiPath: API_PATH_CREATE_WORKITEM,
    pathParams: {},
    queryParams: {},
  };

  const body: Record<string, unknown> = {
    work_item_type_key: input.workItemTypeKey,
    name: input.name,
  };

  if (input.templateId !== undefined) {
    body.template_id = input.templateId;
  }

  if (input.fieldValuePairs !== undefined) {
    body.field_value_pairs = input.fieldValuePairs.map((pair) => ({
      field_key: pair.field_key,
      field_value: pair.field_value,
    }));
  }

  req.body = body;
  req.pathParams.project_key = input.projectKey;

  return req;
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
  pluginId?: string;
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

// Simple data interfaces for response parsing
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
// Based on project-oapi-sdk-golang/client.go pattern

export class MeegleClient {
  private config: MeegleClientOptions;

  constructor(options: MeegleClientOptions) {
    this.config = {
      baseUrl: options.baseUrl || "https://www.meegle.com",
      timeout: options.timeout || 30000,
      userToken: options.userToken,
      userKey: options.userKey,
    };
  }

  private getHeaders(
    idempotent = false,
    idempotencyKey?: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-PLUGIN-TOKEN": this.config.userToken,
      "X-USER-KEY": this.config.userKey,
    };

    if (idempotent) {
      headers["X-IDEM-UUID"] = idempotencyKey ?? generateIdemUUID();
    }

    return headers;
  }

  private buildUrl(req: ApiReq): string {
    let url = replacePathParams(req.apiPath, req.pathParams);

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.queryParams)) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    return joinUrl(this.config.baseUrl ?? "https://www.meegle.com", url);
  }

  private async request(
    req: ApiReq,
    idempotent = false,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    const url = this.buildUrl(req);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: req.httpMethod,
        headers: this.getHeaders(idempotent, idempotencyKey),
        body: req.body ? JSON.stringify(req.body) : undefined,
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
  // Based on project-oapi-sdk-golang/service/project/api.go

  async getSpaces(userKey?: string): Promise<MeegleSpace[]> {
    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_GET_SPACES,
      pathParams: {},
      queryParams: {},
      body: { user_key: userKey || this.config.userKey },
    };

    const data = await this.request(req);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseSpace);
  }

  async getSpaceDetails(projectKeys: string[], userKey?: string): Promise<MeegleSpace[]> {
    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_GET_SPACE_DETAILS,
      pathParams: {},
      queryParams: {},
      body: {
        project_keys: projectKeys,
        user_key: userKey || this.config.userKey,
      },
    };

    const data = await this.request(req);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseSpace);
  }

  // ==================== User Methods ====================
  // Based on project-oapi-sdk-golang/service/user/api.go

  async getUsers(userKeys: string[]): Promise<MeegleUser[]> {
    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_GET_USERS,
      pathParams: {},
      queryParams: {},
      body: { user_keys: userKeys },
    };

    const data = await this.request(req);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseUser);
  }

  // ==================== Workitem Methods ====================
  // Based on project-oapi-sdk-golang/service/workitem/api.go

  async createWorkitem(input: CreateWorkitemRequest): Promise<MeegleWorkitem> {
    const req = createWorkitemRequestBuilder(input);
    clientLogger.info({ projectKey: input.projectKey, workItemTypeKey: input.workItemTypeKey, name: input.name, templateId: input.templateId, hasIdempotencyKey: Boolean(input.idempotencyKey) }, "CREATE_WORKITEM START");

    let data: Record<string, unknown>;
    try {
      data = await this.request(req, true, input.idempotencyKey);
    } catch (error) {
      if (error instanceof MeegleRateLimitError) {
        clientLogger.error({
          projectKey: input.projectKey,
          workItemTypeKey: input.workItemTypeKey,
          statusCode: error.statusCode,
          response: error.response,
          message: error.message,
        }, "CREATE_WORKITEM FAIL");
      } else if (error instanceof MeegleAPIError) {
        clientLogger.error({
          projectKey: input.projectKey,
          workItemTypeKey: input.workItemTypeKey,
          statusCode: error.statusCode,
          response: error.response,
          message: error.message,
        }, "CREATE_WORKITEM FAIL");
      } else {
        clientLogger.error({
          projectKey: input.projectKey,
          workItemTypeKey: input.workItemTypeKey,
          message: error instanceof Error ? error.message : String(error),
        }, "CREATE_WORKITEM FAIL");
      }
      throw error;
    }

    // The API returns either:
    // - { data: <number_id> } for create responses (just the workitem ID)
    // - { data: { full_workitem_object } } for other responses
    const responseData = data.data ?? data;

    // If response is just a number (the workitem ID), fetch full details
    if (typeof responseData === "number" || typeof responseData === "string") {
      const workitemId = String(responseData);
      clientLogger.info({ workitemId }, "CREATE_WORKITEM OK numeric_id");
      const workitems = await this.getWorkitemDetails(
        input.projectKey,
        input.workItemTypeKey,
        [workitemId],
      );
      if (workitems.length === 0) {
        throw new Error(`Failed to fetch created workitem ${workitemId}`);
      }
      return workitems[0];
    }

    // Otherwise, parse the full workitem object directly
    const workitemData = responseData as Record<string, unknown>;
    clientLogger.info({ workitemId: workitemData.id ?? workitemData.work_item_id }, "CREATE_WORKITEM OK full_object");
    return parseWorkitem(workitemData);
  }

  async updateWorkitem(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    updateFields: Array<{ fieldKey: string; fieldValue: unknown }>,
  ): Promise<MeegleWorkitem> {
    const req: ApiReq = {
      httpMethod: "PUT",
      apiPath: API_PATH_UPDATE_WORKITEM,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
      },
      queryParams: {},
      body: {
        update_fields: updateFields.map((f) => ({
          field_key: f.fieldKey,
          field_value: f.fieldValue,
        })),
      },
    };

    const data = await this.request(req, true);
    const workitemData = (data.data ?? data) as Record<string, unknown>;
    return parseWorkitem(workitemData);
  }

  async deleteWorkitem(
    projectKey: string,
    workitemType: string,
    workitemId: string,
  ): Promise<Record<string, unknown>> {
    const req: ApiReq = {
      httpMethod: "DELETE",
      apiPath: API_PATH_DELETE_WORKITEM,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
      },
      queryParams: {},
    };

    return this.request(req, true);
  }

  async abortWorkitem(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    isAborted: boolean,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    const req: ApiReq = {
      httpMethod: "PUT",
      apiPath: API_PATH_ABORT_WORKITEM,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
      },
      queryParams: {},
      body: {
        is_aborted: isAborted,
        ...(reason && { reason }),
      },
    };

    return this.request(req, true);
  }

  async getWorkitemDetails(
    projectKey: string,
    workitemType: string,
    workitemIds: string[],
  ): Promise<MeegleWorkitem[]> {
    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_QUERY_WORKITEM,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
      },
      queryParams: {},
      body: {
        work_item_ids: workitemIds,
      },
    };

    const data = await this.request(req);
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
    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_FILTER_WORKITEM,
      pathParams: {
        project_key: projectKey,
      },
      queryParams: {},
      body: {
        page_num: pageNum,
        page_size: pageSize,
        ...(workitemTypeKeys && { work_item_type_keys: workitemTypeKeys }),
      },
    };

    const data = await this.request(req);
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

    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_FILTER_WORKITEM_ACROSS_PROJECT,
      pathParams: {},
      queryParams: {},
      body: {
        work_item_type_key: workitemTypeKey,
        page_num: pageNum,
        page_size: pageSize,
        ...(simpleNames && { simple_names: simpleNames }),
      },
    };

    const data = await this.request(req);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseWorkitem);
  }

  async getWorkitemMeta(projectKey: string, workitemType: string): Promise<Record<string, unknown>> {
    const req: ApiReq = {
      httpMethod: "GET",
      apiPath: API_PATH_GET_WORKITEM_META,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
      },
      queryParams: {},
    };

    const data = await this.request(req);
    return (data.data ?? data) as Record<string, unknown>;
  }

  // ==================== Workflow Methods ====================

  async getWorkflowDetails(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    flowType = 0,
  ): Promise<Record<string, unknown>> {
    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_WORKFLOW_QUERY,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
      },
      queryParams: {},
      body: { flow_type: flowType },
    };

    const data = await this.request(req);
    return (data.data ?? data) as Record<string, unknown>;
  }

  async getWbsView(
    projectKey: string,
    workitemType: string,
    workitemId: string,
  ): Promise<Record<string, unknown>> {
    const req: ApiReq = {
      httpMethod: "GET",
      apiPath: API_PATH_WBS_VIEW,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
      },
      queryParams: {},
    };

    const data = await this.request(req);
    return (data.data ?? data) as Record<string, unknown>;
  }

  async operateWorkflowNode(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    nodeId: string,
    action: string,
  ): Promise<Record<string, unknown>> {
    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_NODE_OPERATE,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
        node_id: nodeId,
      },
      queryParams: {},
      body: { action },
    };

    return this.request(req, true);
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
    const payload: Record<string, unknown> = {};
    if (options?.nodeOwners) {
      payload.node_owners = options.nodeOwners;
    }
    if (options?.nodeSchedule) {
      payload.node_schedule = options.nodeSchedule;
    }

    const req: ApiReq = {
      httpMethod: "PUT",
      apiPath: API_PATH_NODE_UPDATE,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
        node_id: nodeId,
      },
      queryParams: {},
      body: payload,
    };

    return this.request(req, true);
  }

  async changeWorkflowState(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    transitionId: number,
  ): Promise<Record<string, unknown>> {
    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_NODE_STATE_CHANGE,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
      },
      queryParams: {},
      body: { transition_id: transitionId },
    };

    return this.request(req, true);
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

    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_CREATE_TASK,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
      },
      queryParams: {},
      body: payload,
    };

    return this.request(req, true);
  }

  async getTasks(
    projectKey: string,
    workitemType: string,
    workitemId: string,
  ): Promise<Record<string, unknown>[]> {
    const req: ApiReq = {
      httpMethod: "GET",
      apiPath: API_PATH_GET_TASKS,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
      },
      queryParams: {},
    };

    const data = await this.request(req);
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

    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_UPDATE_TASK,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
        node_id: nodeId,
        task_id: taskId,
      },
      queryParams: {},
      body: payload,
    };

    return this.request(req, true);
  }

  // ==================== View Methods ====================

  async getViewWorkitems(projectKey: string, viewId: string): Promise<MeegleWorkitem[]> {
    const req: ApiReq = {
      httpMethod: "GET",
      apiPath: API_PATH_GET_VIEWS,
      pathParams: {
        project_key: projectKey,
        fix_view_id: viewId,
      },
      queryParams: {},
    };

    const data = await this.request(req);
    const items = parseItemsList(data.data ?? data, ["items"]);
    return items.map(parseWorkitem);
  }

  async updateFixedView(
    projectKey: string,
    viewId: string,
    addWorkItemIds: number[],
  ): Promise<Record<string, unknown>> {
    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_UPDATE_FIXED_VIEW,
      pathParams: {
        project_key: projectKey,
        fix_view_id: viewId,
      },
      queryParams: {},
      body: { add_work_item_ids: addWorkItemIds },
    };

    return this.request(req, true);
  }

  async deleteFixedView(projectKey: string, viewId: string): Promise<Record<string, unknown>> {
    const req: ApiReq = {
      httpMethod: "DELETE",
      apiPath: API_PATH_DELETE_FIXED_VIEW,
      pathParams: {
        project_key: projectKey,
        fix_view_id: viewId,
      },
      queryParams: {},
    };

    return this.request(req, true);
  }

  async createFixedView(
    projectKey: string,
    name: string,
    workItemIdList: number[],
  ): Promise<Record<string, unknown>> {
    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_CREATE_FIXED_VIEW,
      pathParams: {
        project_key: projectKey,
      },
      queryParams: {},
      body: {
        name,
        work_item_id_list: workItemIdList,
      },
    };

    return this.request(req, true);
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

    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_LIST_VIEWS,
      pathParams: {
        project_key: projectKey,
      },
      queryParams: {},
      body: payload,
    };

    const data = await this.request(req);
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
    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_COMMENT_CREATE,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
      },
      queryParams: {},
      body: { content },
    };

    const data = await this.request(req, true);
    const commentData = (data.data ?? data) as Record<string, unknown>;
    return parseComment(commentData);
  }

  async getComments(
    projectKey: string,
    workitemType: string,
    workitemId: string,
  ): Promise<MeegleComment[]> {
    const req: ApiReq = {
      httpMethod: "GET",
      apiPath: API_PATH_COMMENT_LIST,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
      },
      queryParams: {},
    };

    const data = await this.request(req);
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
    const req: ApiReq = {
      httpMethod: "PUT",
      apiPath: API_PATH_COMMENT_UPDATE,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
        comment_id: commentId,
      },
      queryParams: {},
      body: { content },
    };

    const data = await this.request(req, true);
    const commentData = (data.data ?? data) as Record<string, unknown>;
    return parseComment(commentData);
  }

  async deleteComment(
    projectKey: string,
    workitemType: string,
    workitemId: string,
    commentId: string,
  ): Promise<Record<string, unknown>> {
    const req: ApiReq = {
      httpMethod: "DELETE",
      apiPath: API_PATH_COMMENT_DELETE,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
        work_item_id: workitemId,
        comment_id: commentId,
      },
      queryParams: {},
    };

    return this.request(req);
  }

  // ==================== Field Methods ====================

  async getFields(projectKey: string): Promise<Record<string, unknown>[]> {
    const req: ApiReq = {
      httpMethod: "POST",
      apiPath: API_PATH_GET_FIELDS,
      pathParams: {
        project_key: projectKey,
      },
      queryParams: {},
      body: {},
    };

    const data = await this.request(req);
    const result = data.data ?? data;
    return Array.isArray(result) ? result : [];
  }

  // ==================== Workflow Template Methods ====================

  async getWorkflowTemplates(
    projectKey: string,
    workitemType: string,
  ): Promise<Record<string, unknown>[]> {
    const req: ApiReq = {
      httpMethod: "GET",
      apiPath: API_PATH_GET_WORKFLOW_TEMPLATES,
      pathParams: {
        project_key: projectKey,
        work_item_type_key: workitemType,
      },
      queryParams: {},
    };

    const data = await this.request(req);
    const result = data.data ?? data;
    return Array.isArray(result) ? result : [];
  }

  // ==================== Auth Methods ====================

  /**
   * Get auth code for user authorization
   * Uses cookie-based authentication instead of user token
   */
  async getAuthCode(options: {
    baseUrl?: string;
    cookie: string;
    state?: string;
  }): Promise<string> {
    const { baseUrl, cookie, state = "111" } = options;

    if (!this.config.pluginId) {
      throw new Error("Missing pluginId in client configuration");
    }

    const url = joinUrl(baseUrl ?? this.config.baseUrl ?? "https://www.meegle.com", API_PATH_GET_AUTH_CODE);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": cookie,
        },
        body: JSON.stringify({
          plugin_id: this.config.pluginId,
          state,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await parseJson(response);

      if (!response.ok) {
        throw new Error(`Failed to get auth code: ${response.status} - ${JSON.stringify(data)}`);
      }

      // Check for error in response body
      const errorData = data.error as Record<string, unknown> | undefined;
      if (errorData && typeof errorData.code === "number" && errorData.code !== 0) {
        throw new Error(`Auth code error: ${errorData.msg as string}`);
      }

      const payload = (data.data ?? data) as Record<string, unknown>;
      const authCode = payload.code ?? payload.auth_code;

      if (typeof authCode !== "string") {
        throw new Error("Invalid response: missing auth code");
      }

      return authCode;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }
}
