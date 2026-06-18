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

interface ActionRunOptions {
  actionRunId?: string;
}

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
  let activeActionRunId: string | undefined;

  async function openPreview(options: ActionRunOptions = {}): Promise<void> {
    activeActionRunId = options.actionRunId;
    appendLog(
      "info",
      `开始获取批量创建预览${activeActionRunId ? ` · actionRunId=${activeActionRunId}` : ""}...`,
    );

    const current = readStore();
    const context = extractLarkBaseContextFromUrl(current.state.currentUrl ?? undefined);
    const masterUserId = current.state.identity.masterUserId ?? undefined;

    if (!context.baseId || !context.tableId) {
      const message =
        "当前页面缺少多维表格上下文（需要 URL 中的 base、table）。请在目标表格页面重试。";
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
      ...(context.viewId ? { viewId: context.viewId } : {}),
      masterUserId,
      actionRunId: activeActionRunId,
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
      `批量预览完成，可创建 ${preview.eligibleRecords.length} 条，已跳过 ${preview.skippedRecords.length} 条${activeActionRunId ? ` · actionRunId=${activeActionRunId}` : ""}`,
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
      ...(preview.viewId ? { viewId: preview.viewId } : {}),
      masterUserId,
      actionRunId: activeActionRunId,
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
