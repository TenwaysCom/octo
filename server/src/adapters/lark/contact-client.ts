import { logger } from "../../logger.js";

const contactLogger = logger.child({ module: "lark-contact-client" });

export interface LarkDepartment {
  openDepartmentId: string;
  name: string | null;
}

export interface LarkContactUser {
  openId: string | null;
  email: string | null;
  name: string | null;
}

export interface LarkContactListDepartmentsRequest {
  departmentId: string;
  pageToken?: string;
  pageSize?: number;
}

export interface LarkContactListUsersRequest {
  departmentId: string;
  pageToken?: string;
  pageSize?: number;
}

export interface LarkContactGetUserIdsByEmailsRequest {
  emails: string[];
}

export interface LarkContactListDepartmentsResult {
  departments: LarkDepartment[];
  hasMore: boolean;
  nextPageToken?: string;
}

export interface LarkContactListUsersResult {
  users: LarkContactUser[];
  hasMore: boolean;
  nextPageToken?: string;
}

export interface LarkContactDirectoryClient {
  listChildDepartments(input: LarkContactListDepartmentsRequest): Promise<LarkContactListDepartmentsResult>;
  listUsersByDepartment(input: LarkContactListUsersRequest): Promise<LarkContactListUsersResult>;
}

export interface LarkContactEmailLookupClient {
  getUserIdsByEmails(input: LarkContactGetUserIdsByEmailsRequest): Promise<LarkContactUser[]>;
}

export interface LarkContactClientOptions {
  appId: string;
  appSecret: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  pageSize?: number;
}

type LarkEnvelope<T> = {
  code?: number;
  msg?: string;
  data?: T;
};

type TenantTokenResponse = {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
};

type LarkDepartmentApiItem = {
  open_department_id?: unknown;
  department_id?: unknown;
  name?: unknown;
};

type LarkUserApiItem = {
  open_id?: unknown;
  user_id?: unknown;
  email?: unknown;
  enterprise_email?: unknown;
  name?: unknown;
  en_name?: unknown;
};

type LarkBatchGetIdApiItem = {
  user_id?: unknown;
  open_id?: unknown;
  email?: unknown;
};

type LarkPagedData<T> = {
  items?: T[];
  has_more?: boolean;
  page_token?: string;
};

type LarkBatchGetIdData = {
  user_list?: LarkBatchGetIdApiItem[];
};

export class LarkContactClientError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly responseCode?: number,
  ) {
    super(message);
    this.name = "LarkContactClientError";
  }
}

export class LarkContactClient implements LarkContactDirectoryClient, LarkContactEmailLookupClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private tenantAccessToken?: {
    token: string;
    expiresAtMs: number;
  };

  constructor(private readonly options: LarkContactClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl || "https://open.larksuite.com");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pageSize = options.pageSize ?? 50;
  }

  async listChildDepartments(input: LarkContactListDepartmentsRequest): Promise<LarkContactListDepartmentsResult> {
    const path = `/open-apis/contact/v3/departments/${encodeURIComponent(input.departmentId)}/children`;
    const data = await this.request<LarkPagedData<LarkDepartmentApiItem>>("GET", path, {
      department_id_type: "open_department_id",
      fetch_child: "true",
      page_size: String(input.pageSize ?? this.pageSize),
      page_token: input.pageToken,
    });

    return {
      departments: (data.items ?? []).map((item) => ({
        openDepartmentId: readString(item.open_department_id) ?? readString(item.department_id) ?? "",
        name: readString(item.name) ?? null,
      })).filter((department) => department.openDepartmentId !== ""),
      hasMore: data.has_more === true,
      nextPageToken: data.page_token,
    };
  }

  async listUsersByDepartment(input: LarkContactListUsersRequest): Promise<LarkContactListUsersResult> {
    const data = await this.request<LarkPagedData<LarkUserApiItem>>("GET", "/open-apis/contact/v3/users/find_by_department", {
      department_id_type: "open_department_id",
      department_id: input.departmentId,
      user_id_type: "open_id",
      page_size: String(input.pageSize ?? this.pageSize),
      page_token: input.pageToken,
    });

    return {
      users: (data.items ?? []).map((item) => ({
        openId: readString(item.open_id) ?? readString(item.user_id) ?? null,
        email: readString(item.email) ?? readString(item.enterprise_email) ?? null,
        name: readString(item.name) ?? readString(item.en_name) ?? null,
      })),
      hasMore: data.has_more === true,
      nextPageToken: data.page_token,
    };
  }

  async getUserIdsByEmails(input: LarkContactGetUserIdsByEmailsRequest): Promise<LarkContactUser[]> {
    if (input.emails.length === 0) {
      return [];
    }

    const data = await this.request<LarkBatchGetIdData>(
      "POST",
      "/open-apis/contact/v3/users/batch_get_id",
      {
        user_id_type: "open_id",
      },
      {
        emails: input.emails,
      },
    );

    return (data.user_list ?? []).map((item) => ({
      openId: readString(item.user_id) ?? readString(item.open_id) ?? null,
      email: readString(item.email) ?? null,
      name: null,
    }));
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    params: Record<string, string | undefined>,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const token = await this.getTenantAccessToken();
    const url = new URL(path, this.baseUrl);

    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== "") {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await this.fetchImpl(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseBody = await readJson<LarkEnvelope<T>>(response);
    if (!response.ok || responseBody.code !== 0) {
      contactLogger.warn({
        method,
        path,
        status: response.status,
        code: responseBody.code,
        msg: responseBody.msg,
      }, "LARK_CONTACT_REQUEST_FAILED");
      throw new LarkContactClientError(
        responseBody.msg || `Lark contact request failed: ${response.status}`,
        response.status,
        responseBody.code,
      );
    }

    return (responseBody.data ?? {}) as T;
  }

  private async getTenantAccessToken(): Promise<string> {
    if (this.tenantAccessToken && this.tenantAccessToken.expiresAtMs > Date.now() + 60_000) {
      return this.tenantAccessToken.token;
    }

    const url = new URL("/open-apis/auth/v3/tenant_access_token/internal", this.baseUrl);
    const response = await this.fetchImpl(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_id: this.options.appId,
        app_secret: this.options.appSecret,
      }),
    });

    const body = await readJson<TenantTokenResponse>(response);
    if (!response.ok || body.code !== 0 || !body.tenant_access_token) {
      contactLogger.warn({
        status: response.status,
        code: body.code,
        msg: body.msg,
      }, "LARK_TENANT_TOKEN_REQUEST_FAILED");
      throw new LarkContactClientError(
        body.msg || `Failed to get Lark tenant access token: ${response.status}`,
        response.status,
        body.code,
      );
    }

    this.tenantAccessToken = {
      token: body.tenant_access_token,
      expiresAtMs: Date.now() + Math.max((body.expire ?? 7200) - 60, 60) * 1000,
    };
    return body.tenant_access_token;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
