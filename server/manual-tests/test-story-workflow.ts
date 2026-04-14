/**
 * Test A2 -> Story workflow
 */

import { executeA2ToB1Flow, A2Record } from "./src/application/services/a2-workflow.service.js";
import { PostgresMeegleTokenStore } from "./src/adapters/postgres/meegle-token-store.js";
import { MeegleClient } from "./src/adapters/meegle/meegle-client.js";
import { createHttpMeegleAuthAdapter } from "./src/adapters/meegle/auth-adapter.js";

// Mock resolved user
const mockResolvedUser = {
  id: "a400632e-8d08-4ddf-977d-e8330b0adc5a",
  larkUserId: "ou_8d08-4ddf-977d-e8330b0adc5a",
  larkTenantId: "",
  meegleUserKey: "7538275242901291040",
  meegleBaseUrl: "https://project.larksuite.com",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockResolvedUserStore = {
  getById: async () => mockResolvedUser,
  getByLarkId: async () => mockResolvedUser,
  save: async () => {},
};

async function testA2ToStory() {
  console.log("=== Test A2 -> Story Workflow ===");

  const mockRecord: A2Record = {
    recordId: "test-a2-story-001",
    title: "[E2E Test] 新增用户管理功能",
    summary: "需要开发用户管理模块",
    target: "支持管理员对用户进行增删改查操作",
    acceptance: "管理员可以在后台管理所有用户信息",
    priority: "P1",
  };

  try {
    const result = await executeA2ToB1Flow(
      { recordId: mockRecord.recordId },
      {
        loadRecord: async () => mockRecord,
        resolvedUserStore: mockResolvedUserStore as any,
        authAdapter: createHttpMeegleAuthAdapter({
          pluginId: process.env.MEEGLE_PLUGIN_ID || "",
          pluginSecret: process.env.MEEGLE_PLUGIN_SECRET || "",
        }),
        tokenStore: new PostgresMeegleTokenStore(),
        createClient: (input) => new MeegleClient(input),
      }
    );
    console.log("✓ A2->Story workflow completed successfully:");
    console.log("  Status:", result.status);
    console.log("  Workitem ID:", result.workitemId);
    console.log("  Draft type:", result.draft.draftType);
    console.log("  URL: https://project.larksuite.com/4c3fv6/story/detail/" + result.workitemId);
  } catch (error) {
    console.error("✗ A2->Story workflow failed:", error);
  }
}

async function main() {
  await testA2ToStory();
  console.log("\n=== Test complete ===");
}

main().catch(console.error);
