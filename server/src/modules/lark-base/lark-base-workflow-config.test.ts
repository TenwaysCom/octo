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

  it("loads extractor sources and fallback sources from config", () => {
    process.env.LARK_BASE_WORKFLOW_CONFIG_PATH = "./src/modules/lark-base/fixtures/test-extractor-config.json";
    const config = loadLarkBaseWorkflowConfig();
    expect(config).toBeDefined();

    const mappings = getFieldMappingsForType("story", config!);
    expect(mappings).toHaveLength(7);
    const recordLinkMapping = mappings!.find((m) => m.meegleField === "field_e8ad0a");
    const messageLinkMapping = mappings!.find((m) => m.meegleField === "field_8d0341");
    const ticketLinkMapping = mappings!.find((m) => m.meegleField === "field_e7984b");
    const customRecordLinkMapping = mappings!.find((m) => m.meegleField === "field_custom_record_link");
    const customMessageLinkMapping = mappings!.find((m) => m.meegleField === "field_custom_message_link");

    expect(recordLinkMapping).toMatchObject({
      meegleField: "field_e8ad0a",
      source: {
        sourceType: "record_url",
      },
    });
    expect(messageLinkMapping).toMatchObject({
      meegleField: "field_8d0341",
      source: {
        sourceType: "field",
        sourceField: "Lark Message Link",
      },
      fallbackSources: [
        {
          sourceType: "description_regex",
          pattern: "https?:\\/\\/[^\\s\"<>]*(?:threadid|chatid|messageid)=[^\\s\"<>]*",
        },
      ],
    });
    expect(ticketLinkMapping).toMatchObject({
      meegleField: "field_e7984b",
      source: {
        sourceType: "shared_record_url",
      },
    });
    expect(customRecordLinkMapping).toMatchObject({
      meegleField: "field_custom_record_link",
      source: {
        sourceType: "record_url",
      },
    });
    expect(customMessageLinkMapping).toMatchObject({
      meegleField: "field_custom_message_link",
      source: {
        sourceType: "description_regex",
        pattern: "https?:\\/\\/[^\\s\"<>]*(?:threadid|chatid|messageid)=[^\\s\"<>]*",
      },
    });
  });
  it("loads fixed sources with notes from config", () => {
    process.env.LARK_BASE_WORKFLOW_CONFIG_PATH = "./src/modules/lark-base/fixtures/test-fixed-source-config.json";
    const config = loadLarkBaseWorkflowConfig();
    expect(config).toBeDefined();

    const mappings = getFieldMappingsForType("66700acbf297a8f821b4b860", config!);
    const techTeamMapping = mappings?.find((m) => m.meegleField === "field_7c2f56");

    expect(techTeamMapping).toMatchObject({
      meegleField: "field_7c2f56",
      notes: "Tech Team",
      source: {
        sourceType: "fixed",
        value: "cmb9pif3i",
      },
      transform: "text",
    });
  });
});
