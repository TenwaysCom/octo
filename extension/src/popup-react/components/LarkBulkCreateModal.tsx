import type {
  LarkBaseBulkCreateResultPayload,
  LarkBaseBulkPreviewResultPayload,
} from "../../types/lark.js";
import { UiButton } from "./UiButton.js";

export function LarkBulkCreateModal({
  visible,
  stage,
  preview,
  result,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  stage: "hidden" | "preview" | "executing" | "result";
  preview: Extract<LarkBaseBulkPreviewResultPayload, { ok: true }> | null;
  result: LarkBaseBulkCreateResultPayload | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="bulk-modal-backdrop" data-test="lark-bulk-create-modal">
      <div className="bulk-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-modal-title">
        <div className="bulk-modal__header">
          <h3 id="bulk-modal-title">批量创建 MEEGLE TICKET</h3>
          <button className="bulk-modal__close" type="button" onClick={onClose}>
            关闭
          </button>
        </div>

        {stage === "preview" ? (
          <div className="bulk-modal__body">
            <p className="bulk-modal__summary">
              本次将创建 {preview?.eligibleRecords.length ?? 0} 条，已跳过{" "}
              {preview?.skippedRecords.length ?? 0} 条。
            </p>
            <table className="bulk-modal__table">
              <thead>
                <tr>
                  <th>记录 ID</th>
                  <th>Title</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {(preview?.eligibleRecords ?? []).map((record) => (
                  <tr key={record.recordId}>
                    <td>{record.recordId}</td>
                    <td>{record.title}</td>
                    <td>{record.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {stage === "executing" ? (
          <div className="bulk-modal__body">
            <p>创建中...</p>
          </div>
        ) : null}

        {stage === "result" ? (
          <div className="bulk-modal__body">
            {result?.ok ? (
              <>
                <p className="bulk-modal__summary">
                  创建完成: 成功 {result.summary.created}，失败 {result.summary.failed}，跳过{" "}
                  {result.summary.skipped}
                </p>
                {result.createdRecords.length > 0 ? (
                  <div className="bulk-modal__section">
                    <h4>已创建</h4>
                    <ul>
                      {result.createdRecords.map((record) => (
                        <li key={record.recordId}>
                          {record.recordId} | {record.title} | {record.priority}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {result.failedRecords.length > 0 ? (
                  <div className="bulk-modal__section">
                    <h4>失败</h4>
                    <ul>
                      {result.failedRecords.map((record) => (
                        <li key={record.recordId}>
                          {record.recordId} | {record.errorMessage}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p>创建失败: {result?.error.errorMessage}</p>
            )}
          </div>
        ) : null}

        <div className="bulk-modal__footer">
          {stage === "preview" ? (
            <UiButton onClick={onConfirm}>确认创建</UiButton>
          ) : (
            <UiButton onClick={onClose}>关闭</UiButton>
          )}
        </div>
      </div>
    </div>
  );
}
