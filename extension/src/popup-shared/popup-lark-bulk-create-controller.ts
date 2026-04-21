import { extractLarkBaseContextFromUrl } from "../lark-base-url.js";
import {
  runLarkBaseBulkCreateRequest,
  runLarkBaseBulkPreviewRequest,
} from "../popup/runtime.js";
import type { PopupLogLevel } from "../popup/types.js";
import type { LarkBaseBulkPreviewResultPayload } from "../types/lark.js";
import type {
  LarkBulkCreateModalError,
  LarkBulkCreateModalState,
} from "./popup-controller.js";

type PopupStoreSnapshot = {
  state: {
    currentUrl: string | null;
    identity: {
      masterUserId: string | null;
    };
  };
  larkBulkCreateModal: {
    preview: Extract<LarkBaseBulkPreviewResultPayload, { ok: true }> | null;
  };
};

interface CreateLarkBulkCreateControllerDeps {
  readStore: () => PopupStoreSnapshot;
  appendLog: (level: PopupLogLevel, message: string) => void;
  showToast: (text: string, level?: PopupLogLevel) => void;
  setModalState: (
    next:
      | LarkBulkCreateModalState
      | ((previous: LarkBulkCreateModalState) => LarkBulkCreateModalState),
  ) => void;
  openErrorModal: (error: LarkBulkCreateModalError) => void;
}

export function createLarkBulkCreateController(
  deps: CreateLarkBulkCreateControllerDeps,
) {
  const { readStore, appendLog, showToast, setModalState, openErrorModal } = deps;

  async function openPreview(): Promise<void> {
    appendLog("info", "开始获取批量创建预览...");

    const current = readStore();
    const context = extractLarkBaseContextFromUrl(current.state.currentUrl ?? undefined);
    const masterUserId = current.state.identity.masterUserId ?? undefined;

    if (!context.baseId || !context.tableId || !context.viewId) {
      const message =
        "当前页面缺少多维表格上下文（需要 URL 中的 base、table、view）。请在目标表格的指定视图中打开页面后重试。";
      appendLog("error", message);
      openErrorModal({
        errorCode: "MISSING_LARK_BASE_CONTEXT",
        errorMessage: message,
      });
      return;
    }

    const preview = await runLarkBaseBulkPreviewRequest({
      baseId: context.baseId,
      tableId: context.tableId,
      viewId: context.viewId,
      masterUserId,
    });

    if (!preview.ok) {
      appendLog("error", `批量预览失败: ${preview.error.errorMessage}`);
      openErrorModal({
        errorCode: preview.error.errorCode,
        errorMessage: preview.error.errorMessage,
      });
      return;
    }

    setModalState({
      visible: true,
      stage: "preview",
      preview,
      result: null,
      bulkError: null,
    });

    appendLog(
      "info",
      `批量预览完成，可创建 ${preview.eligibleRecords.length} 条，已跳过 ${preview.skippedRecords.length} 条`,
    );
  }

  async function confirmCreate(): Promise<void> {
    const current = readStore();
    const preview = current.larkBulkCreateModal.preview;

    if (!preview) {
      return;
    }

    const masterUserId = current.state.identity.masterUserId ?? undefined;

    const result = await runLarkBaseBulkCreateRequest({
      baseId: preview.baseId,
      tableId: preview.tableId,
      viewId: preview.viewId,
      masterUserId,
    });

    setModalState((previous) => ({
      ...previous,
      visible: true,
      stage: "result",
      result,
      bulkError: null,
    }));

    if (!result.ok) {
      const errorMessage = `批量创建失败: ${result.error.errorMessage}`;
      showToast(errorMessage, "error");
      appendLog("error", errorMessage);
      return;
    }

    const successMessage = `批量创建完成: 成功 ${result.summary.created}，失败 ${result.summary.failed}，跳过 ${result.summary.skipped}`;
    showToast(successMessage, "success");
    appendLog("success", successMessage);
  }

  return {
    openPreview,
    confirmCreate,
  };
}
