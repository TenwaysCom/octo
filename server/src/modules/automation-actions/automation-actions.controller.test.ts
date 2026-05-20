import { beforeEach, describe, expect, it } from "vitest";
import {
  PostgresAutomationActionStore,
  configureAutomationActionStore,
} from "../../adapters/postgres/automation-action-store.js";
import {
  PostgresResolvedUserStore,
  configureResolvedUserStore,
} from "../../adapters/postgres/resolved-user-store.js";
import { createTestPostgresDatabase } from "../../adapters/postgres/test-db.js";
import {
  executeAutomationActionController,
  listAutomationActionsController,
} from "./automation-actions.controller.js";

async function seedUserAndActions() {
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
      executor_config: { actionKey: "lookup-github-pr" },
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
      executor_config: {
        promptTemplate: "请分析 {{pageType}} 页面：{{url}}",
      },
      presentation_type: "open_chat",
      created_at: now,
      updated_at: now,
    },
    {
      id: "act_dev_only",
      key: "github.dev_only",
      title: "开发专用动作",
      description: null,
      enabled: true,
      priority: 30,
      page_types: JSON.stringify(["github"]),
      url_regexes: JSON.stringify(["^https://github.com/"]),
      allowed_roles: JSON.stringify(["developer"]),
      executor_type: "action",
      executor_config: { actionKey: "create-github-branch" },
      presentation_type: null,
      created_at: now,
      updated_at: now,
    },
  ]).execute();
}

describe("automation-actions.controller", () => {
  beforeEach(async () => {
    await seedUserAndActions();
  });

  it("lists actions matched by page type, url, and resolved user role", async () => {
    const result = await listAutomationActionsController({
      url: "https://github.com/tenways/octo/pull/123",
      pageType: "github",
      masterUserId: "usr_pm",
    });

    expect(result).toEqual({
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
            description: undefined,
            executor: {
              type: "prompt",
            },
          },
        ],
      },
    });
  });

  it("does not list role-gated actions when master user is missing", async () => {
    const result = await listAutomationActionsController({
      url: "https://github.com/tenways/octo/pull/123",
      pageType: "github",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        actions: [],
      },
    });
  });

  it("executes prompt actions by returning a chat draft message", async () => {
    const result = await executeAutomationActionController({
      actionKey: "pm.analyze_current_page",
      url: "https://github.com/tenways/octo/pull/123",
      pageType: "github",
      masterUserId: "usr_pm",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        presentation: {
          type: "open_chat",
          draftMessage: "请分析 github 页面：https://github.com/tenways/octo/pull/123",
        },
      },
    });
  });
});
