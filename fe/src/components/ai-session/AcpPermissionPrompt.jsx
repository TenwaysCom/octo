import { useEffect, useState } from "react";

const STATUS = { pending: "等待你确认工具操作", approved: "已允许", rejected: "已拒绝，本轮已终止", expired: "审批已过期，请重新执行", cancelled: "审批已取消" };

export function AcpPermissionPrompt({ permission, onReply, active = false }) {
  const [now, setNow] = useState(Date.now);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (permission.status !== "pending" || !active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [permission.status, active]);
  const expired = now >= Date.parse(permission.expiresAt);
  const status = permission.status === "pending" ? expired ? "expired" : !active ? "cancelled" : "pending" : permission.status;
  const toolCall = permission.toolCall || {};
  const operation = typeof toolCall.rawInput?.command === "string" ? toolCall.rawInput.command
    : (toolCall.content || []).map((item) => item.content?.text || "").filter(Boolean).join("\n");
  const options = [...(permission.options || [])].sort((left, right) => Number(right.kind === "allow_once") - Number(left.kind === "allow_once"));
  async function reply(optionId) {
    setSubmitting(true);
    setError("");
    try {
      await onReply({ sessionId: permission.sessionId, actionRunId: permission.actionRunId, requestId: permission.requestId, optionId });
      setSubmitted(true);
    } catch (failure) { setError(failure.message); } finally { setSubmitting(false); }
  }
  return <section className="ticket-ai-permission" aria-label="工具操作审批">
    <strong role="status">{STATUS[status] || "审批已结束"}</strong>
    <p>{toolCall.title || "Agent 请求执行工具操作"}</p>
    {operation ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{operation}</pre> : null}
    {status === "pending" && active ? <>
      <p>剩余 {Math.max(0, Math.ceil((Date.parse(permission.expiresAt) - now) / 1000))} 秒。工具授权不包含发布业务草稿。</p>
      <div>{options.map((option) => <button key={option.optionId} type="button" disabled={submitting || submitted} onClick={() => void reply(option.optionId)}>
        {option.kind === "allow_once" ? "仅允许这一次" : option.kind === "reject_once" ? "拒绝" : option.name}
      </button>)}</div>
    </> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
