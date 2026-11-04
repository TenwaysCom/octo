import type { Kysely } from "kysely";
import type { DatabaseSchema } from "../../adapters/postgres/schema.js";
import { LarkClient } from "../../adapters/lark/lark-client.js";
import { parsePlatformSyncConfig } from "../../config/platform-sync-config.js";
import { createLarkThreadTicketIntakeRuntime } from "./lark-thread-ticket-intake.factory.js";
import { createLarkThreadTicketIntakeService } from "./lark-thread-ticket-intake.service.js";
import { createLarkTicketThreadContextService } from "./lark-ticket-thread-context.service.js";
import { createLarkTicketShadowSummaryService } from "./lark-ticket-shadow-summary.service.js";
import { PostgresLarkTicketThreadSyncStore } from "../../adapters/postgres/lark-ticket-thread-sync-store.js";

vi.mock("../../adapters/lark/lark-client.js", () => ({ LarkClient: vi.fn() }));
vi.mock("../../adapters/ai/ticket-summary-client.js", () => ({ createTicketSummaryJsonCompletionClient: vi.fn() }));
vi.mock("./lark-thread-ticket-intake.service.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./lark-thread-ticket-intake.service.js")>(),
  createLarkThreadTicketIntakeService: vi.fn(),
}));
vi.mock("./platform-sync.service.js", () => ({
  PlatformSyncService: class {
    constructor(readonly deps: unknown) {}
  },
}));
vi.mock("./lark-ticket-thread-context.service.js", () => ({ createLarkTicketThreadContextService: vi.fn() }));
vi.mock("./lark-ticket-shadow-summary.service.js", () => ({
  createLarkTicketShadowSummaryService: vi.fn(() => ({ summarizeOne: vi.fn().mockResolvedValue("ok") })),
}));

const config = parsePlatformSyncConfig({
  larkBase: [{ baseId: "base", tableId: "table", larkBaseUrl: "https://open.larksuite.com" }],
  scheduler: { tasks: { larkThreadTickets: { sources: [{ baseId: "base", tableId: "table", chatId: "oc_chat" }] } } },
});

describe("Lark thread intake application identity", () => {
  afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("injects the existing thread cache lookup scoped to the configured Base and table", async () => {
    const aliases = new Map([["7704136071327518471", "omt_existing"]]);
    const lookup = vi.spyOn(PostgresLarkTicketThreadSyncStore.prototype, "listThreadAliases").mockResolvedValue(aliases);
    createLarkThreadTicketIntakeRuntime({ db: {} as Kysely<DatabaseSchema>, config, appId: "cli_app", appSecret: "secret" });
    const deps = vi.mocked(createLarkThreadTicketIntakeService).mock.calls[0]![0];
    expect(await deps.loadThreadAliases!(deps.sources[0]!, ["7704136071327518471"])).toEqual(aliases);
    expect(lookup).toHaveBeenCalledWith({ baseId: "base", tableId: "table", threadIds: ["7704136071327518471"] });
  });

  it("injects application clients into intake, sync and shadow thread reads without a user authorization", async () => {
    vi.stubEnv("PLATFORM_SYNC_MASTER_USER_ID", "");
    createLarkThreadTicketIntakeRuntime({ db: {} as Kysely<DatabaseSchema>, config, appId: "cli_app", appSecret: "secret" });
    const deps = vi.mocked(createLarkThreadTicketIntakeService).mock.calls[0]![0];
    const source = deps.sources[0]!;
    await deps.createClient(source, "intake-run");
    const sync = deps.syncService as unknown as { deps: { createLarkClient: (input: unknown) => Promise<unknown> } };
    await sync.deps.createLarkClient({ masterUserId: "ignored-user", larkBaseUrl: source.larkBaseUrl, actionRunId: "sync-run" });
    const contextDeps = vi.mocked(createLarkTicketThreadContextService).mock.calls[0]![0]!;
    await contextDeps.buildClient!("ignored-user", source.larkBaseUrl!, "shadow-run");
    expect(vi.mocked(LarkClient).mock.calls.map(([options]) => options)).toEqual([
      { appId: "cli_app", appSecret: "secret", baseUrl: source.larkBaseUrl, actionRunId: "intake-run" },
      { appId: "cli_app", appSecret: "secret", baseUrl: source.larkBaseUrl, actionRunId: "sync-run" },
      { appId: "cli_app", appSecret: "secret", baseUrl: source.larkBaseUrl, actionRunId: "shadow-run" },
    ]);
    expect(deps.masterUserId).toBe("lark-app:cli_app");
    await deps.shadowService.summarizeOne({ baseId: "base", tableId: "table" } as never, "shadow-run");
    expect(createLarkTicketShadowSummaryService).toHaveBeenCalledWith(expect.objectContaining({ masterUserId: "lark-app:cli_app" }));
  });

  it("requires application credentials rather than falling back to the worker user's token", () => {
    vi.stubEnv("LARK_APP_ID", "");
    vi.stubEnv("LARK_APP_SECRET", "");
    vi.stubEnv("PLATFORM_SYNC_MASTER_USER_ID", "ben-user");
    expect(() => createLarkThreadTicketIntakeRuntime({ db: {} as Kysely<DatabaseSchema>, config })).toThrow("LARK_THREAD_TICKET_APP_REQUIRED");
    expect(LarkClient).not.toHaveBeenCalled();
  });
});
