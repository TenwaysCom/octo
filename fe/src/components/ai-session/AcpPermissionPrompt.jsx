import { useEffect, useRef, useState } from "react";

const STATUS = { pending: "等待你确认工具操作", approved: "已允许", rejected: "已拒绝，本轮已终止", expired: "审批已过期，请重新执行", cancelled: "审批已取消" };

export function AcpPermissionPrompt({ permission, onReply, active = false }) {
  const [now, setNow] = useState(Date.now);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [replyStatus, setReplyStatus] = useState(null);
  const promptRef = useRef(null);
  const replyPending = useRef(false);
  useEffect(() => {
    if (permission.status !== "pending" || !active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [permission.status, active]);
  useEffect(() => {
    if (permission.status === "pending" && active && Date.now() < Date.parse(permission.expiresAt)) {
      promptRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [permission.requestId, permission.status, active]);
  const expiresAt = Date.parse(permission.expiresAt);
  const expired = !Number.isFinite(expiresAt) || now >= expiresAt;
  const status = permission.status === "pending" ? replyStatus || (expired ? "expired" : !active ? "cancelled" : "pending") : permission.status;
  const toolCall = permission.toolCall || {};
  const operation = typeof toolCall.rawInput?.command === "string" ? toolCall.rawInput.command
    : (toolCall.content || []).map((item) => item.content?.text || "").filter(Boolean).join("\n");
  const options = [...(permission.options || [])].sort((left, right) => Number(right.kind === "allow_once") - Number(left.kind === "allow_once"));
  const diffs = (toolCall.content || []).filter((item) => item.type === "diff");
  async function reply(optionId) {
    if (status !== "pending" || !active || replyPending.current || submitted) return;
    if (Date.now() >= expiresAt) { setNow(Date.now()); return; }
    replyPending.current = true;
    setSubmitting(true);
    setError("");
    try {
      await onReply({ sessionId: permission.sessionId, actionRunId: permission.actionRunId, requestId: permission.requestId, optionId });
      setSubmitted(true);
    } catch (failure) {
      if (failure.code === "ACP_PERMISSION_EXPIRED") setReplyStatus("expired");
      if (failure.code === "ACP_PERMISSION_NOT_PENDING") setReplyStatus("ended");
      setError(failure.message || "审批回复失败，请重试。");
    } finally { replyPending.current = false; setSubmitting(false); }
  }
  return <section ref={promptRef} className={`ticket-ai-permission ticket-ai-permission--${status}`} aria-label="工具操作审批" aria-busy={submitting}>
    <strong role="status">{STATUS[status] || "审批已结束"}</strong>
    <p>{toolCall.title || "Agent 请求执行工具操作"}</p>
    {operation ? <pre>{operation}</pre> : null}
    {diffs.map((diff, index) => <details key={`${diff.path}-${index}`} className="ticket-ai-permission__details">
      <summary>文件修改：{diff.path}</summary>
      <p>修改前</p><pre>{diff.oldText ?? "（新建文件）"}</pre>
      <p>修改后</p><pre>{diff.newText}</pre>
    </details>)}
    {toolCall.rawInput ? <details className="ticket-ai-permission__details"><summary>完整操作参数</summary><pre>{JSON.stringify(toolCall.rawInput, null, 2)}</pre></details> : null}
    {status === "pending" && active ? <>
      <p>AI 正在等待你的选择。拒绝或超时将终止本轮。</p>
      <p>剩余 {Math.max(0, Math.ceil((expiresAt - now) / 1000))} 秒。工具授权不包含发布业务草稿。</p>
      <div className="ticket-ai-permission__actions">{options.map((option) => <button key={option.optionId} type="button" className={option.kind === "allow_once" ? "ticket-ai-permission__allow" : undefined} disabled={submitting || submitted} onClick={() => void reply(option.optionId)}>
        {option.kind === "allow_once" ? "仅允许这一次" : option.kind === "reject_once" ? "拒绝并停止" : option.name}
      </button>)}</div>
      {submitting || submitted ? <p role="status">{submitting ? "正在提交审批…" : "已提交，正在更新审批结果…"}</p> : null}
    </> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
