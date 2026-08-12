function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

export function getLarkTicketBadgeTone(kind, value) {
  const normalized = normalize(value);
  if (!normalized) return "default";

  if (kind === "status") {
    if (["closed", "done", "resolved", "finished", "completed", "已关闭", "已完成", "已解决", "已取消"].includes(normalized)) return "completed";
    if (["in progress", "ongoing", "doing", "处理中", "进行中", "开发中"].includes(normalized)) return "active";
    if (normalized.includes("review") || normalized.includes("test") || normalized.includes("评审") || normalized.includes("测试")) return "review";
    if (["open", "new", "todo", "to do", "待处理", "新建", "待开始"].includes(normalized)) return "open";
    return "default";
  }

  if (kind === "type") {
    if (normalized.includes("bug") || normalized.includes("缺陷") || normalized.includes("问题")) return "bug";
    if (normalized.includes("story") || normalized.includes("feature") || normalized.includes("需求")) return "story";
    if (normalized.includes("task") || normalized.includes("任务")) return "task";
    return "default";
  }

  if (kind === "priority") {
    if (["p0", "critical", "urgent", "紧急"].includes(normalized)) return "critical";
    if (["p1", "high", "高"].includes(normalized)) return "high";
    if (["p2", "medium", "中"].includes(normalized)) return "medium";
    if (["p3", "low", "低"].includes(normalized)) return "low";
  }

  return "default";
}
