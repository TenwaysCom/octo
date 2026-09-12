function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

export function getLarkTicketBadgeTone(kind, value) {
  const normalized = normalize(value);
  if (!normalized) return "default";

  if (kind === "status") {
    if (["cancelled", "canceled", "duplicate", "已取消", "重复", "已合并"].includes(normalized)) return "cancelled";
    if (["rejected", "blocked", "已拒绝", "已驳回", "阻塞"].includes(normalized)) return "blocked";
    if (["closed", "done", "resolved", "finish", "finished", "completed", "已关闭", "已完成", "已解决"].includes(normalized)) return "completed";
    if (normalized.includes("triage") || ["待分类", "待分诊"].includes(normalized)) return "triage";
    if (["design", "designing", "设计", "设计中"].includes(normalized)) return "design";
    if (["discover", "discovery", "调研", "调研中"].includes(normalized)) return "discovery";
    if (["in progress", "ongoing", "doing", "处理中", "进行中", "开发中"].includes(normalized)) return "active";
    if (normalized.includes("review") || normalized.includes("test") || normalized.includes("评审") || normalized.includes("测试")) return "review";
    if (["open", "new", "todo", "to do", "待处理", "新建", "待开始"].includes(normalized)) return "open";
    if (["pending", "waiting", "on hold", "等待中", "待确认"].includes(normalized)) return "open";
    return "default";
  }

  if (kind === "type") {
    if (normalized.includes("bug") || normalized.includes("缺陷") || normalized.includes("问题")) return "bug";
    if (normalized.includes("story") || normalized.includes("feature") || normalized.includes("需求")) return "story";
    if (normalized.includes("task") || normalized.includes("任务")) return "task";
    return "default";
  }

  if (kind === "business-line") {
    const tones = ["line-blue", "line-purple", "line-teal", "line-orange", "line-pink", "line-lime", "line-cyan", "line-indigo"];
    let hash = 0;
    for (const char of normalized) hash = (Math.imul(hash, 31) + char.codePointAt(0)) >>> 0;
    return tones[hash % tones.length];
  }

  if (kind === "priority") {
    if (["p0", "critical", "urgent", "紧急"].includes(normalized)) return "critical";
    if (["p1", "high", "高"].includes(normalized)) return "high";
    if (["p2", "medium", "中"].includes(normalized)) return "medium";
    if (["p3", "low", "低"].includes(normalized)) return "low";
  }

  return "default";
}
