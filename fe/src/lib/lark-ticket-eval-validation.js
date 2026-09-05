function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function getLarkTicketEvalValidationMessage(draft) {
  if (draft.datasetStatus === "draft") return "";

  const missing = [];
  if (!hasText(draft.manualIntent)) missing.push("填写「人工标准意图」");
  if (!hasText(draft.expectedOutcome)) missing.push("填写「期望结果」");
  if (draft.datasetStatus === "badcase" && (!Array.isArray(draft.failureLabels) || draft.failureLabels.length === 0)) {
    missing.push("至少选择一个失败标签");
  }
  if (!missing.length) return "";

  return `${draft.datasetStatus === "badcase" ? "标记 Badcase" : "纳入 Eval"} 前，请${missing.join("、")}。`;
}

export function getLarkTicketEvalSaveErrorMessage(error) {
  if (error?.code === "INVALID_REQUEST") {
    return "保存内容未通过校验：请填写「人工标准意图」和「期望结果」；标记 Badcase 时还需至少选择一个失败标签。";
  }
  return error?.message || "样本保存失败。";
}
