export function getLarkTicketEvalValidationMessage(draft, source = "legacy") {
  if (draft.datasetStatus === "badcase" && (!Array.isArray(draft.failureLabels) || draft.failureLabels.length === 0)) return "标记 Badcase 前，请至少选择一个失败标签。";
  if (source === "shadow" && draft.datasetStatus === "badcase" && !draft.notes?.trim()) return "标记 Badcase 前，请填写失败原因。";
  if ([draft.notes, draft.manualIntent, draft.expectedOutcome].some((value) => typeof value === "string" && value.trim().length > 4000)) return "每项标注最多填写 4000 字符。";
  return "";
}

export function getLarkTicketEvalSaveErrorMessage(error) {
  const messages = {
    EVAL_SAMPLE_CONFLICT: "标注已被更新，请重新读取，核对最新标注后保存。你的输入已保留。",
    SHADOW_OUTPUT_CHANGED: "分析或线程材料已更新，请重新读取并核对输出。你的输入已保留；材料变化时需重新分析。",
    SHADOW_OUTPUT_UNAVAILABLE: "暂无可评价的成功 Shadow 分析。",
    BADCASE_REASON_REQUIRED: "标记 Badcase 前，请填写失败原因。",
    WORKSPACE_ACCESS_DENIED: "当前账号没有 Ticket 评测权限。",
    THREAD_SNAPSHOT_NOT_FOUND: "该 Ticket 尚未准备线程快照。",
    THREAD_SNAPSHOT_INCOMPLETE: "线程快照不完整，需要意图、问题摘要和方案摘要齐全。",
  };
  if (messages[error?.code]) return messages[error.code];
  if (error?.code === "INVALID_REQUEST") {
    return "保存内容未通过校验，请检查必填项和字段长度；若页面较旧，请刷新后重试。";
  }
  return error?.message || "样本保存失败。";
}
