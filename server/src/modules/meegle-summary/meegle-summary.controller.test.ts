import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateSummaryController,
  applySummaryController,
} from "./meegle-summary.controller.js";

const generateWorkitemSummaryMock = vi.fn();
const applyWorkitemSummaryMock = vi.fn();
const handleMeegleSummaryErrorMock = vi.fn();

vi.mock("./meegle-summary.service.js", () => ({
  generateWorkitemSummary: (...args: unknown[]) =>
    generateWorkitemSummaryMock(...args),
  applyWorkitemSummary: (...args: unknown[]) =>
    applyWorkitemSummaryMock(...args),
  handleMeegleSummaryError: (...args: unknown[]) =>
    handleMeegleSummaryErrorMock(...args),
}));

describe("meegle-summary.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateSummaryController", () => {
    it("returns generated markdown successfully", async () => {
      generateWorkitemSummaryMock.mockResolvedValueOnce({
        ok: true,
        markdown: "## ✅ 核心信息确认\n- [ ] 业务背景",
        workItemType: "story",
        prefilledSections: ["核心信息确认"],
        emptySections: ["产品结论"],
      });

      const result = await generateSummaryController({
        projectKey: "PROJ1",
        workItemTypeKey: "story",
        workItemId: "12345",
        masterUserId: "usr_xxx",
        baseUrl: "https://project.larksuite.com",
      });

      expect(result).toEqual({
        ok: true,
        markdown: "## ✅ 核心信息确认\n- [ ] 业务背景",
        workItemType: "story",
        prefilledSections: ["核心信息确认"],
        emptySections: ["产品结论"],
      });
      expect(generateWorkitemSummaryMock).toHaveBeenCalledWith({
        projectKey: "PROJ1",
        workItemTypeKey: "story",
        workItemId: "12345",
        masterUserId: "usr_xxx",
        baseUrl: "https://project.larksuite.com",
      });
    });

    it("returns invalid request for missing fields", async () => {
      const result = await generateSummaryController({
        projectKey: "PROJ1",
      });

      expect(result).toEqual({
        ok: false,
        error: {
          errorCode: "INVALID_REQUEST",
          errorMessage: expect.any(String),
        },
      });
      expect(generateWorkitemSummaryMock).not.toHaveBeenCalled();
    });

    it("returns summary failed when service throws", async () => {
      const serviceError = new Error("Workitem not found");
      generateWorkitemSummaryMock.mockRejectedValueOnce(serviceError);
      handleMeegleSummaryErrorMock.mockReturnValueOnce({
        ok: false,
        error: {
          errorCode: "SUMMARY_FAILED",
          errorMessage: "Workitem not found",
        },
      });

      const result = await generateSummaryController({
        projectKey: "PROJ1",
        workItemTypeKey: "story",
        workItemId: "12345",
        masterUserId: "usr_xxx",
        baseUrl: "https://project.larksuite.com",
      });

      expect(result).toEqual({
        ok: false,
        error: {
          errorCode: "SUMMARY_FAILED",
          errorMessage: "Workitem not found",
        },
      });
      expect(handleMeegleSummaryErrorMock).toHaveBeenCalledWith(serviceError);
    });
  });

  describe("applySummaryController", () => {
    it("applies summary markdown successfully", async () => {
      applyWorkitemSummaryMock.mockResolvedValueOnce({
        ok: true,
        workItemId: "12345",
        summaryFieldKey: "field_summary",
      });

      const result = await applySummaryController({
        projectKey: "PROJ1",
        workItemTypeKey: "story",
        workItemId: "12345",
        masterUserId: "usr_xxx",
        baseUrl: "https://project.larksuite.com",
        summaryFieldKey: "field_summary",
        summaryMarkdown: "## ✅ 核心信息确认\n- [x] 业务背景",
      });

      expect(result).toEqual({
        ok: true,
        workItemId: "12345",
        summaryFieldKey: "field_summary",
      });
      expect(applyWorkitemSummaryMock).toHaveBeenCalledWith({
        projectKey: "PROJ1",
        workItemTypeKey: "story",
        workItemId: "12345",
        masterUserId: "usr_xxx",
        baseUrl: "https://project.larksuite.com",
        summaryFieldKey: "field_summary",
        summaryMarkdown: "## ✅ 核心信息确认\n- [x] 业务背景",
      });
    });

    it("returns invalid request for missing fields", async () => {
      const result = await applySummaryController({
        projectKey: "PROJ1",
      });

      expect(result).toEqual({
        ok: false,
        error: {
          errorCode: "INVALID_REQUEST",
          errorMessage: expect.any(String),
        },
      });
      expect(applyWorkitemSummaryMock).not.toHaveBeenCalled();
    });

    it("returns apply failed when service throws", async () => {
      const serviceError = new Error("Meegle auth expired");
      applyWorkitemSummaryMock.mockRejectedValueOnce(serviceError);
      handleMeegleSummaryErrorMock.mockReturnValueOnce({
        ok: false,
        error: {
          errorCode: "AUTH_EXPIRED",
          errorMessage: "Meegle 认证已过期或无效，请在插件中重新授权 Meegle 后再试。",
        },
      });

      const result = await applySummaryController({
        projectKey: "PROJ1",
        workItemTypeKey: "story",
        workItemId: "12345",
        masterUserId: "usr_xxx",
        baseUrl: "https://project.larksuite.com",
        summaryFieldKey: "field_summary",
        summaryMarkdown: "## ✅ 核心信息确认",
      });

      expect(result).toEqual({
        ok: false,
        error: {
          errorCode: "AUTH_EXPIRED",
          errorMessage: "Meegle 认证已过期或无效，请在插件中重新授权 Meegle 后再试。",
        },
      });
      expect(handleMeegleSummaryErrorMock).toHaveBeenCalledWith(serviceError);
    });
  });
});
