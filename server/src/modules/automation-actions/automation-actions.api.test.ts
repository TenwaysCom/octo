import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "../../index.js";
import {
  PostgresAutomationActionStore,
  configureAutomationActionStore,
} from "../../adapters/postgres/automation-action-store.js";
import {
  PostgresResolvedUserStore,
  configureResolvedUserStore,
} from "../../adapters/postgres/resolved-user-store.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";

let server: Server | undefined;
let baseUrl = "";

async function startServer(): Promise<void> {
  server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopServer(): Promise<void> {
  const currentServer = server;
  server = undefined;
  baseUrl = "";

  if (!currentServer) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    currentServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function postJson(path: string, input: { masterUserId?: string; body: unknown }) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (input.masterUserId) {
    headers["master-user-id"] = input.masterUserId;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input.body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function seedApiTestData(): Promise<void> {
  const { db } = await createTestPostgresDatabase();
  configureAutomationActionStore(new PostgresAutomationActionStore(db));
  configureResolvedUserStore(new PostgresResolvedUserStore(db));

  const now = "2026-05-18T00:00:00.000Z";
  await db.insertInto("users").values({
    id: "usr_pm",
    status: "active",
    lark_tenant_key: null,
    lark_id: "ou_pm",
    lark_email: null,
    lark_name: null,
    lark_avatar_url: null,
    role: "pm",
    meegle_base_url: null,
    meegle_user_key: null,
    github_id: null,
    created_at: now,
    updated_at: now,
  }).execute();

  await db.insertInto("automation_actions").values([
    {
      id: "act_github_lookup",
      key: "github.lookup_pr",
      title: "查询 PR 关联的 Meegle 工作项",
      description: "复用现有 GitHub PR 查询动作",
      enabled: true,
      priority: 10,
      page_types: JSON.stringify(["github"]),
      url_regexes: JSON.stringify(["^https://github.com/.+/.+/pull/\\d+"]),
      allowed_roles: JSON.stringify(["pm"]),
      executor_type: "action",
      executor_config: JSON.stringify({ actionKey: "lookup-github-pr" }),
      presentation_type: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: "act_prompt",
      key: "pm.analyze_current_page",
      title: "分析当前页面",
      description: null,
      enabled: true,
      priority: 20,
      page_types: JSON.stringify(["github"]),
      url_regexes: JSON.stringify(["^https://github.com/"]),
      allowed_roles: JSON.stringify(["pm"]),
      executor_type: "prompt",
      executor_config: JSON.stringify({
        promptTemplate: "请分析 {{pageType}} 页面：{{url}}",
      }),
      presentation_type: "open_chat",
      created_at: now,
      updated_at: now,
    },
  ]).execute();
}

describe("automation action API", () => {
  beforeEach(async () => {
    await seedApiTestData();
    await startServer();
  });

  afterEach(async () => {
    await stopServer();
  });

  it("lists matched automation actions through the HTTP server", async () => {
    const result = await postJson("/api/automation-actions/list", {
      masterUserId: "usr_pm",
      body: {
        url: "https://github.com/tenways/octo/pull/123",
        pageType: "github",
      },
    });

    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        data: {
          actions: [
            {
              key: "github.lookup_pr",
              title: "查询 PR 关联的 Meegle 工作项",
              description: "复用现有 GitHub PR 查询动作",
              executor: {
                type: "action",
                actionKey: "lookup-github-pr",
              },
            },
            {
              key: "pm.analyze_current_page",
              title: "分析当前页面",
              executor: {
                type: "prompt",
              },
            },
          ],
        },
      },
    });
  });

  it("returns a chat draft for prompt actions through the HTTP server", async () => {
    const result = await postJson("/api/automation-actions/execute", {
      masterUserId: "usr_pm",
      body: {
        actionKey: "pm.analyze_current_page",
        url: "https://github.com/tenways/octo/pull/123",
        pageType: "github",
      },
    });

    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        data: {
          presentation: {
            type: "open_chat",
            draftMessage: "请分析 github 页面：https://github.com/tenways/octo/pull/123",
          },
        },
      },
    });
  });

  it("requires the master-user-id header", async () => {
    const result = await postJson("/api/automation-actions/list", {
      body: {
        url: "https://github.com/tenways/octo/pull/123",
        pageType: "github",
      },
    });

    expect(result).toEqual({
      status: 401,
      body: {
        ok: false,
        error: {
          errorCode: "UNAUTHORIZED",
          errorMessage: "Missing master-user-id header",
        },
      },
    });
  });
});
