import "dotenv/config";
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { LarkContactClient, type LarkContactDirectoryClient } from "../adapters/lark/contact-client.js";
import { createPostgresDatabase, ensurePostgresSchema } from "../adapters/postgres/database.js";
import { PostgresLarkContactStore } from "../adapters/postgres/lark-contact-store.js";
import { syncLarkContacts } from "../application/services/lark-contact-sync.service.js";
import { logger } from "../logger.js";

const scriptLogger = logger.child({ module: "sync-lark-contacts-script" });

type SyncLarkContactsSource = "app" | "lark-cli-user";
type RunLarkCli = (args: string[]) => Promise<string>;

export interface SyncLarkContactsScriptArgs {
  source: SyncLarkContactsSource;
  baseUrl: string;
  rootDepartmentId: string;
  pageSize: number;
  includeChildDepartments: boolean;
  postgresUri: string;
  larkCliBin: string;
}

type EnvLike = Record<string, string | undefined>;

type LarkCliPagedData<T> = {
  items?: T[];
  has_more?: boolean;
  page_token?: string;
};

type LarkCliDepartmentItem = {
  open_department_id?: unknown;
  department_id?: unknown;
  name?: unknown;
};

type LarkCliUserItem = {
  open_id?: unknown;
  user_id?: unknown;
  email?: unknown;
  enterprise_email?: unknown;
  name?: unknown;
  en_name?: unknown;
};

type LarkCliResponse<T> = {
  ok?: boolean;
  error?: {
    message?: string;
  };
  code?: number;
  msg?: string;
  data?: unknown;
} & T;

export function parseSyncLarkContactsArgs(
  argv: string[],
  env: EnvLike = process.env,
): SyncLarkContactsScriptArgs {
  const args: SyncLarkContactsScriptArgs = {
    source: parseSyncSource(env.LARK_CONTACT_SYNC_SOURCE || "app"),
    baseUrl: env.LARK_OPENAPI_BASE_URL || "https://open.larksuite.com",
    rootDepartmentId: env.LARK_CONTACT_SYNC_ROOT_DEPARTMENT_ID || "0",
    pageSize: parsePageSize(env.LARK_CONTACT_SYNC_PAGE_SIZE || "50"),
    includeChildDepartments: parseBooleanEnv(env.LARK_CONTACT_SYNC_INCLUDE_CHILD_DEPARTMENTS, true),
    postgresUri: env.POSTGRES_URI || env.DATABASE_URL || "",
    larkCliBin: env.LARK_CLI_BIN || "lark-cli",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--source") {
      args.source = parseSyncSource(readNextArg(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--base-url") {
      args.baseUrl = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--department-id" || arg === "--root-department-id") {
      args.rootDepartmentId = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--page-size") {
      args.pageSize = parsePageSize(readNextArg(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--direct-only" || arg === "--skip-child-departments") {
      args.includeChildDepartments = false;
      continue;
    }

    if (arg === "--postgres-uri" || arg === "--db") {
      args.postgresUri = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--lark-cli-bin") {
      args.larkCliBin = readNextArg(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

export class LarkCliUserContactClient implements LarkContactDirectoryClient {
  private readonly larkCliBin: string;
  private readonly runLarkCli: RunLarkCli;

  constructor(options: {
    larkCliBin?: string;
    runLarkCli?: RunLarkCli;
  } = {}) {
    this.larkCliBin = options.larkCliBin || "lark-cli";
    this.runLarkCli = options.runLarkCli ?? ((args) => runLarkCliCommand(this.larkCliBin, args));
  }

  async listChildDepartments(input: {
    departmentId: string;
    pageToken?: string;
    pageSize?: number;
  }): Promise<{
    departments: Array<{ openDepartmentId: string; name: string | null }>;
    hasMore: boolean;
    nextPageToken?: string;
  }> {
    const data = await this.get<LarkCliPagedData<LarkCliDepartmentItem>>(
      `/open-apis/contact/v3/departments/${encodeURIComponent(input.departmentId)}/children`,
      {
        department_id_type: "open_department_id",
        fetch_child: "true",
        page_size: String(input.pageSize ?? 50),
        page_token: input.pageToken,
      },
    );

    return {
      departments: (data.items ?? []).map((item) => ({
        openDepartmentId: readString(item.open_department_id) ?? readString(item.department_id) ?? "",
        name: readString(item.name) ?? null,
      })).filter((department) => department.openDepartmentId !== ""),
      hasMore: data.has_more === true,
      nextPageToken: data.page_token,
    };
  }

  async listUsersByDepartment(input: {
    departmentId: string;
    pageToken?: string;
    pageSize?: number;
  }): Promise<{
    users: Array<{ openId: string | null; email: string | null; name: string | null }>;
    hasMore: boolean;
    nextPageToken?: string;
  }> {
    const data = await this.get<LarkCliPagedData<LarkCliUserItem>>(
      "/open-apis/contact/v3/users/find_by_department",
      {
        department_id_type: "open_department_id",
        department_id: input.departmentId,
        user_id_type: "open_id",
        page_size: String(input.pageSize ?? 50),
        page_token: input.pageToken,
      },
    );

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

  private async get<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value != null && value !== ""),
    );
    const stdout = await this.runLarkCli([
      "api",
      "GET",
      path,
      "--as",
      "user",
      "--params",
      JSON.stringify(filteredParams),
      "--format",
      "json",
    ]);

    return parseLarkCliApiData<T>(stdout);
  }
}

export function parseLarkCliApiData<T>(stdout: string): T {
  const parsed = JSON.parse(stdout) as LarkCliResponse<T>;
  if (parsed.ok === false) {
    throw new Error(parsed.error?.message || "lark-cli api failed");
  }

  const rawResponse = parsed.ok === true && isRecord(parsed.data) ? parsed.data : parsed;
  if (isRecord(rawResponse) && typeof rawResponse.code === "number" && rawResponse.code !== 0) {
    throw new Error(readString(rawResponse.msg) || `Lark API failed with code ${rawResponse.code}`);
  }

  if (isRecord(rawResponse) && "data" in rawResponse) {
    return (rawResponse.data ?? {}) as T;
  }

  return rawResponse as T;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write([
      "Usage: pnpm --dir server lark:contacts:sync [options]",
      "",
      "Options:",
      "  --source <app|lark-cli-user> Source to read contacts from, default app",
      "  --base-url <url>              Lark OpenAPI base URL, default https://open.larksuite.com",
      "  --department-id <id>          Root open department id, default 0",
      "  --page-size <1-50>            Lark page size, default 50",
      "  --direct-only                 Sync only direct users of --department-id",
      "  --postgres-uri <uri>          Postgres connection string",
      "  --lark-cli-bin <path>         lark-cli binary for --source lark-cli-user",
      "",
    ].join("\n"));
    return;
  }

  const args = parseSyncLarkContactsArgs(argv);
  if (!args.postgresUri) {
    throw new Error("POSTGRES_URI or DATABASE_URL is required");
  }

  let client: LarkContactDirectoryClient;
  if (args.source === "lark-cli-user") {
    client = new LarkCliUserContactClient({
      larkCliBin: args.larkCliBin,
    });
  } else {
    const appId = process.env.LARK_APP_ID || "";
    const appSecret = process.env.LARK_APP_SECRET || "";
    if (!appId || !appSecret) {
      throw new Error("LARK_APP_ID and LARK_APP_SECRET are required");
    }

    client = new LarkContactClient({
      appId,
      appSecret,
      baseUrl: args.baseUrl,
      pageSize: args.pageSize,
    });
  }

  const db = createPostgresDatabase(args.postgresUri);
  try {
    await ensurePostgresSchema(db);
    const result = await syncLarkContacts({
      client,
      store: new PostgresLarkContactStore(db),
      rootDepartmentId: args.rootDepartmentId,
      pageSize: args.pageSize,
      includeChildDepartments: args.includeChildDepartments,
    });

    process.stdout.write([
      "[lark-contacts] sync completed",
      `  departmentsScanned: ${result.departmentsScanned}`,
      `  usersScanned: ${result.usersScanned}`,
      `  contactsUpserted: ${result.contactsUpserted}`,
      `  contactsSkipped: ${result.contactsSkipped}`,
      "",
    ].join("\n"));
  } finally {
    await db.destroy();
  }
}

function readNextArg(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${name}`);
  }

  return value;
}

function parsePageSize(value: string): number {
  const pageSize = Number(value);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new Error("Invalid --page-size: expected an integer from 1 to 50");
  }

  return pageSize;
}

function parseSyncSource(value: string): SyncLarkContactsSource {
  if (value === "app" || value === "lark-cli-user") {
    return value;
  }

  throw new Error("Invalid --source: expected app or lark-cli-user");
}

function runLarkCliCommand(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).trim()));
        return;
      }

      resolve(stdout);
    });
  });
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isMainModule()) {
  void main().catch((error) => {
    const message = formatSyncLarkContactsError(error);
    scriptLogger.error({ errorMessage: message }, "LARK_CONTACT_SYNC_SCRIPT_FAILED");
    process.stderr.write(`[lark-contacts] sync failed: ${message}\n`);
    process.exit(1);
  });
}

export function formatSyncLarkContactsError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/no dept authority/i.test(message)) {
    return [
      message,
      "Lark denied department contact access. Grant the app contact data permission for the root department, or rerun with --department-id <open_department_id> --direct-only to sync only direct users in an authorized department.",
    ].join("\n");
  }

  return message;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}
