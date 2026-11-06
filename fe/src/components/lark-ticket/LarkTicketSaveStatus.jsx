const LABELS = { status: "状态", priority: "紧急度", requester: "需求人", responsible: "负责人", issueType: "类型", businessLine: "Business Line" };

export function LarkTicketSaveStatus({ edits, ticket, className = "ticket-property__message" }) {
  const status = edits.status(ticket);
  return <div aria-live="polite">
    {status.entries.map((entry) => <div key={JSON.stringify(entry.ticket)} className={className}>
      {!ticket ? <span>{entry.label}： </span> : null}
      {entry.phase === "waiting" ? <span>等待保存…</span> : null}
      {entry.phase === "saving" ? <span>正在保存…</span> : null}
      {entry.phase === "restoring" ? <span>正在核对暂存草稿…</span> : null}
      {!entry.pending && !entry.syncCount && entry.phase === "saved" ? <span>已保存</span> : null}
      {entry.syncCount ? <span>已保存，待同步 <button type="button" disabled={entry.syncing} onClick={() => void edits.retrySync(entry.ticket)}>{entry.syncing ? "正在同步…" : "重试同步"}</button> </span> : null}
      {entry.message ? <span role="alert">{entry.message} </span> : null}
      {["unknown", "error"].includes(entry.phase) ? <button type="button" disabled={entry.checking}
        onClick={() => void edits.recheck(entry.ticket)}>{entry.checking ? "正在核对…" : "重新核对"}</button> : null}
      {entry.phase === "error" && entry.canDiscard ? <button type="button" onClick={() => edits.discardDraft(entry.ticket)}>放弃未保存修改</button> : null}
      {entry.phase === "conflict" ? <>
        <ul>{entry.conflicts.map((field) => <li key={field}>{LABELS[field]}：我的选择「{entry.local[field]?.value || "空"}」，Lark 最新「{entry.remote?.[field]?.value || "空"}」</li>)}</ul>
        <button type="button" onClick={() => edits.resolveConflict(entry.ticket, "local")}>保留我的选择并重试</button>{" "}
        <button type="button" onClick={() => edits.resolveConflict(entry.ticket, "remote")}>采用 Lark 最新值</button>
      </> : null}
    </div>)}
    {status.notices.map((notice, index) => <p className={className} role="alert" key={`${index}:${notice}`}>{notice}</p>)}
  </div>;
}
