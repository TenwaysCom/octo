import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadLarkBaseWorkflowConfig,
  getFieldMappingsForType,
} from "./lark-base-workflow-config.js";

describe("lark-base-workflow-config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.LARK_BASE_WORKFLOW_CONFIG_PATH = "/nonexistent/config.json";
  });

  it("returns undefined when no config file exists", () => {
    process.env.LARK_BASE_WORKFLOW_CONFIG_PATH = "/nonexistent/config.json";
    const config = loadLarkBaseWorkflowConfig();
    expect(config).toBeUndefined();
    delete process.env.LARK_BASE_WORKFLOW_CONFIG_PATH;
  });

  it("loads and parses a valid config file from env path", () => {
    process.env.LARK_BASE_WORKFLOW_CONFIG_PATH = "./src/modules/lark-base/fixtures/test-config.json";
    const config = loadLarkBaseWorkflowConfig();
    expect(config).toBeDefined();
    expect(config!.issueTypeMappings).toHaveLength(1);
    expect(config!.issueTypeMappings[0]!).toMatchObject({
      larkLabels: ["User Story"],
      workitemTypeKey: "story",
      templateId: "400329",
      urlSlug: "story",
    });
    expect(config!.issueTypeMappings[0]!.fieldMappings).toHaveLength(2);
    expect(config!.issueTypeMappings[0]!.fieldMappings[0]!).toMatchObject({
      larkField: "Issue Description",
      meegleField: "__title__",
      transform: "first_line",
    });
  });

  it("getFieldMappingsForType returns undefined for unknown type", () => {
    process.env.LARK_BASE_WORKFLOW_CONFIG_PATH = "./src/modules/lark-base/fixtures/test-config.json";
    const config = loadLarkBaseWorkflowConfig();
    expect(config).toBeDefined();
    const mappings = getFieldMappingsForType("unknown_type", config!);
    expect(mappings).toBeUndefined();
  });

  it("getFieldMappingsForType returns mappings for known type", () => {
    process.env.LARK_BASE_WORKFLOW_CONFIG_PATH = "./src/modules/lark-base/fixtures/test-config.json";
    const config = loadLarkBaseWorkflowConfig();
    expect(config).toBeDefined();
    const mappings = getFieldMappingsForType("story", config!);
    expect(mappings).toHaveLength(2);
    expect(mappings![0]!).toMatchObject({
      larkField: "Issue Description",
      meegleField: "__title__",
    });
  });
});
