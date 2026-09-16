import { useLayoutEffect, useRef, useState } from "react";
import { updateLarkTicketField } from "../../services/lark-ticket/lark-ticket-actions-api.js";

// Remount on the complete identity so drafts and pending responses stay scoped.
export function LarkTicketSolutionEditor(props) {
  const { apiBaseUrl, ticket } = props;
  return <SolutionEditor key={JSON.stringify([apiBaseUrl, ticket.baseId, ticket.tableId, ticket.recordId])} {...props} />;
}

function SolutionEditor({ ticket, apiBaseUrl, canEdit, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const running = useRef(false);
  const version = useRef(0);
  const input = useRef(null);
  useLayoutEffect(() => () => { version.current += 1; }, []);
  useLayoutEffect(() => { if (editing && canEdit) input.current?.focus(); }, [editing, canEdit]);

  function edit() {
    if (!canEdit || running.current) return;
    setDraft(ticket.solution || "");
    setMessage(null);
    setEditing(true);
  }

  async function save() {
    if (!canEdit || running.current) return;
    const value = draft.trim();
    if (value.length > 20_000) {
      setMessage({ error: true, text: "解决方案最多 20,000 字符。" });
      return;
    }
    running.current = true;
    setSaving(true);
    setMessage(null);
    const requestVersion = version.current;
    try {
      const result = await updateLarkTicketField({ apiBaseUrl, ticket, field: "solution", value, actionRunId: crypto.randomUUID() });
      if (requestVersion !== version.current) return;
      if (result.syncFailed) {
        setMessage({ error: true, text: "已保存到 Lark Base，本地同步失败，请稍后同步 Ticket。" });
        return;
      }
      if (!result.ticket || typeof result.ticket.solution !== "string") {
        setMessage({ error: true, text: "已保存到 Lark Base，暂未获取最新解决方案，请稍后同步 Ticket。" });
        return;
      }
      onUpdated(result.ticket);
      setEditing(false);
      setMessage({ error: false, text: "解决方案已保存到 Lark Base。" });
    } catch (error) {
      if (requestVersion === version.current) setMessage({ error: true, text: error.message || "保存失败，请重试。" });
    } finally {
      running.current = false;
      if (requestVersion === version.current) setSaving(false);
    }
  }

  const label = editing ? (saving ? "正在保存解决方案" : "保存解决方案") : "编辑解决方案";
  return <section className="ticket-detail-section ticket-solution" aria-busy={saving}>
    <div className="ticket-solution__heading">
      <h2>解决方案</h2>
      {canEdit ? <button type="button" className="ticket-solution__action" title={label} aria-label={label}
        disabled={saving} onClick={editing ? () => void save() : edit}>
        {editing ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z" /><path d="M7 3v6h10V3M7 21v-8h10v8" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5M4 20l4-1L21 6a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></svg>}
      </button> : null}
    </div>
    {editing && canEdit ? <textarea ref={input} className="ticket-solution__input" aria-label="解决方案内容"
      rows={6} value={draft} disabled={saving} onChange={(event) => setDraft(event.target.value)} />
      : <p className={`ticket-description ${ticket.solution ? "" : "ticket-description--empty"}`.trim()}>{ticket.solution || "暂无解决方案。"}</p>}
    {message ? <p className={`ticket-property__message${message.error ? " ticket-property__message--error" : ""}`}
      role={message.error ? "alert" : "status"}>{message.text}</p> : null}
  </section>;
}
