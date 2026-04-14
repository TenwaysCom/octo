/**
 * End-to-end test for A1->B2 and A2->B1 workflows
 */

import { executeA1ToB2Flow, A1Record } from "./src/application/services/a1-workflow.service.js";
import { executeA2ToB1Flow, A2Record } from "./src/application/services/a2-workflow.service.js";
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

async function testA1ToB2() {
  console.log("=== Test A1 -> B2 Workflow (Bug) ===");

  const mockRecord: A1Record = {
    recordId: "test-a1-001",
    title: "[E2E Test] Production Bug Report",
    summary: "Users cannot login to the system",
    impact: "Critical - blocking all users",
    priority: "P1",
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
    console.log("✓ A1->B2 workflow completed successfully:");
    console.log("  Status:", result.status);
    console.log("  Workitem ID:", result.workitemId);
    console.log("  Draft type:", result.draft.draftType);
  } catch (error) {
    console.error("✗ A1->B2 workflow failed:", error);
  }
}

async function testA2ToB1() {
  console.log("\n=== Test A2 -> B1 Workflow (Story) ===");

  const mockRecord: A2Record = {
    recordId: "test-a2-001",
    title: "[E2E Test] New Feature Request",
    summary: "Add dark mode to the dashboard",
    target: "Improve user experience",
    acceptance: "Users can toggle dark mode in settings",
    priority: "high",
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
    console.log("✓ A2->B1 workflow completed successfully:");
    console.log("  Status:", result.status);
    console.log("  Workitem ID:", result.workitemId);
    console.log("  Draft type:", result.draft.draftType);
  } catch (error) {
    console.error("✗ A2->B1 workflow failed:", error);
  }
}

async function main() {
  await testA1ToB2();
  await testA2ToB1();
  console.log("\n=== All workflow tests complete ===");
}

main().catch(console.error);
