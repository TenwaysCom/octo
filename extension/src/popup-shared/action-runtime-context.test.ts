import { describe, expect, it } from "vitest";

import {
  collectActionRuntimeContext,
  parseGitHubWorkitemContext,
  parseMeegleWorkitemContext,
} from "./action-runtime-context.js";

describe("action runtime context", () => {
  it("collects Lark Base table and view context from URL", () => {
    const context = collectActionRuntimeContext({
      actionRunId: "run_lark_001",
      currentTab: {
        id: 12,
        url: "https://tenant.larksuite.com/base/base_123?table=tbl_456&view=vew_789",
        origin: "https://tenant.larksuite.com",
        pageType: "lark",
      },
      identity: {
        masterUserId: "usr_123",
      },
    });

    expect(context).toMatchObject({
      actionRunId: "run_lark_001",
      currentTab: {
        id: 12,
        pageType: "lark",
      },
      identity: {
        masterUserId: "usr_123",
      },
      pageContext: {
        lark: {
          baseId: "base_123",
          tableId: "tbl_456",
          viewId: "vew_789",
        },
      },
      previewState: {},
      formValues: {},
      clientContext: {},
    });
  });

  it("collects Lark record context from wiki record URL", () => {
    const context = collectActionRuntimeContext({
      actionRunId: "run_lark_record_001",
      currentTab: {
        id: 12,
        url: "https://tenant.larksuite.com/record/KxOYr6CJKeWYktcI2GilrfRAgeg",
        origin: "https://tenant.larksuite.com",
        pageType: "lark",
      },
      identity: {
        masterUserId: "usr_123",
      },
    });

    expect(context.pageContext.lark?.wikiRecordId).toBe("KxOYr6CJKeWYktcI2GilrfRAgeg");
  });

  it("parses Meegle workitem context", () => {
    expect(
      parseMeegleWorkitemContext("https://project.larksuite.com/OPS/story/detail/12562490"),
    ).toEqual({
      projectKey: "OPS",
      workItemTypeKey: "story",
      workItemId: "12562490",
      baseUrl: "https://project.larksuite.com",
    });
  });

  it("parses GitHub PR and issue context", () => {
    expect(
      parseGitHubWorkitemContext("https://github.com/TenwaysCom/octo/pull/36"),
    ).toEqual({
      owner: "TenwaysCom",
      repo: "octo",
      kind: "pr",
      number: 36,
      url: "https://github.com/TenwaysCom/octo/pull/36",
    });

    expect(
      parseGitHubWorkitemContext("https://github.com/TenwaysCom/octo/issues/36"),
    ).toMatchObject({
      owner: "TenwaysCom",
      repo: "octo",
      kind: "issue",
      number: 36,
    });
  });

  it("keeps form values and client context as extension-owned slots", () => {
    const context = collectActionRuntimeContext({
      actionRunId: "run_form_001",
      currentTab: {
        id: 12,
        url: "https://project.larksuite.com/OPS/story/detail/12562490",
        origin: "https://project.larksuite.com",
        pageType: "meegle",
      },
      identity: {
        masterUserId: "usr_123",
      },
      formValues: {
        branchName: "feat/12562490-test",
      },
      clientContext: {
        extensionVersion: "0.8.0",
      },
    });

    expect(context.formValues.branchName).toBe("feat/12562490-test");
    expect(context.clientContext.extensionVersion).toBe("0.8.0");
  });

  it("does not throw for unsupported URLs", () => {
    expect(parseMeegleWorkitemContext("not a url")).toBeUndefined();
    expect(parseGitHubWorkitemContext("https://example.com/foo")).toBeUndefined();
  });
});
