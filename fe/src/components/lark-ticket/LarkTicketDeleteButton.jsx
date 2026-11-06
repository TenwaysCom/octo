export function LarkTicketDeleteButton({ ticket, fieldEdits, canEdit }) {
  if (!canEdit) return null;
  const saving = fieldEdits.status(ticket).pending > 0;
  const creating = fieldEdits.creationStatus(ticket).status === "running";
  const deletion = fieldEdits.deletionStatus(ticket);
  const deleting = deletion.status === "running";
  return <span>
    <button type="button" disabled={saving || creating || deleting || Boolean(ticket.deletedAt)} onClick={() => {
      if (!window.confirm(`将“${ticket.title || ticket.recordId}”在 Octo 标记删除？\n标记后将从列表和搜索中隐藏，历史数据保留。此操作仅影响 Octo。`)) return;
      void fieldEdits.markDeleted({ ticket }).catch(() => {});
    }}>{deleting ? "正在标记删除…" : "标记删除 Octo Ticket"}</button>
    {deletion.status === "error" ? <span className="ticket-property__message ticket-property__message--error" role="alert">{deletion.message}</span> : null}
  </span>;
}
