/**
 * Test A1 -> Production Bug workflow
 */

import { executeA1ToB2Flow, A1Record } from "./src/application/services/a1-workflow.service.js";
import { PostgresMeegleTokenStore } from "./src/adapters/postgres/meegle-token-store.js";
import { MeegleClient } from "./src/adapters/meegle/meegle-client.js";
import { createHttpMeegleAuthAdapter } from "./src/adapters/meegle/auth-adapter.js";

// Mock resolved user that matches the token in the database
const mockResolvedUser = {
  id: "a400632e-8d08-4ddf-977d-e8330b0adc5a",
  larkUserId: "ou_8d08-4ddf-977d-e8330b0adc5a",
  larkTenantId: "",
  meegleUserKey: "7538275242901291040",
  meegleBaseUrl: "https://project.larksuite.com",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Mock resolved user store
const mockResolvedUserStore = {
  getById: async () => mockResolvedUser,
  getByLarkId: async () => mockResolvedUser,
  save: async () => {},
};

async function testA1ToProductionBug() {
  console.log("=== Test A1 -> Production Bug Workflow ===");

  const mockRecord: A1Record = {
    recordId: "test-a1-prod-001",
    title: "[E2E Test] Production Bug from Support Ticket",
    summary: "用户反馈订单无法支付，需要紧急修复",
    impact: "影响所有用户下单",
    priority: "P0",
    environment: "production",
  };

  try {
    const result = await executeA1ToB2Flow(
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
    console.log("✓ A1->Production Bug workflow completed successfully:");
    console.log("  Status:", result.status);
    console.log("  Workitem ID:", result.workitemId);
    console.log("  Draft type:", result.draft.draftType);
    console.log("  URL: https://project.larksuite.com/4c3fv6/production_bug/detail/" + result.workitemId);
  } catch (error) {
    console.error("✗ A1->Production Bug workflow failed:", error);
  }
}

async function main() {
  await testA1ToProductionBug();
  console.log("\n=== Test complete ===");
}

main().catch(console.error);
