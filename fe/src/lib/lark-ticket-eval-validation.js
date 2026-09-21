export function getLarkTicketEvalValidationMessage(draft) {
  return draft.datasetStatus === "badcase" && (!Array.isArray(draft.failureLabels) || draft.failureLabels.length === 0)
    ? "标记 Badcase 前，请至少选择一个失败标签。" : "";
}

export function getLarkTicketEvalSaveErrorMessage(error) {
  if (error?.code === "INVALID_REQUEST") {
    return "保存内容未通过校验：标记 Bad case 时请至少选择一个失败标签。";
  }
  return error?.message || "样本保存失败。";
}
