import { useEffect, useRef, useState } from "react";
import { LarkTicketBadge } from "./LarkTicketBadge.jsx";
import { LarkTicketResponsible } from "./LarkTicketResponsible.jsx";
import { loadLarkTicketFieldOptions, updateLarkTicketField } from "../../services/lark-ticket/lark-ticket-actions-api.js";

const PROPERTIES = [
  { field: "status", key: "ticketStatus", label: "状态", kind: "status" },
  { field: "priority", key: "priority", label: "紧急度", kind: "priority" },
  { field: "requester", key: "requester", label: "需求人", kind: "user" },
  { field: "responsible", key: "responsible", label: "负责人", kind: "user" },
  { field: "issueType", key: "issueType", label: "类型", kind: "type" },
  { field: "businessLine", key: "businessLine", label: "Business Line", kind: "business-line" },
];

// The caller keys this editor by Ticket identity so drafts cannot cross records.
export function LarkTicketEditableProperties({ ticket, apiBaseUrl, canEdit, onUpdated, children }) {
  const [editing, setEditing] = useState(null);
  const [options, setOptions] = useState({ status: "idle", fields: [] });
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const running = useRef(false);
  const requestVersion = useRef(0);
  useEffect(() => () => { requestVersion.current += 1; }, []);

  async function loadOptions() {
    const version = ++requestVersion.current;
    setOptions({ status: "loading", fields: [] });
    try {
      const fields = await loadLarkTicketFieldOptions({ apiBaseUrl, baseId: ticket.baseId, tableId: ticket.tableId });
      if (version === requestVersion.current) setOptions({ status: "ready", fields });
    } catch {
      if (version === requestVersion.current) setOptions({ status: "error", fields: [] });
    }
  }

  function edit(field) {
    if (!canEdit || running.current) return;
    setEditing(field);
    setSelected("");
    setMessage(null);
    if (options.status !== "ready" && options.status !== "loading") void loadOptions();
  }

  async function save(event, property, fieldOptions) {
    event.preventDefault();
    const option = selected === "" ? undefined : fieldOptions[Number(selected)];
    if (!canEdit || running.current || !option) return;
    running.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const result = await updateLarkTicketField({ apiBaseUrl, ticket, field: property.field,
        value: option.label, optionUserId: option.userId, actionRunId: crypto.randomUUID() });
      if (result.ticket) onUpdated(result.ticket);
      setEditing(null);
      setMessage({ error: Boolean(result.syncFailed), text: result.syncFailed
        ? "已写入 Lark Base，但 Octo 数据同步失败，请稍后同步 Ticket。"
        : `${property.label}已更新并同步至 Lark Base。` });
    } catch (error) {
      setMessage({ error: true, text: error.message || "保存失败，请重试。" });
    } finally {
      running.current = false;
      setSaving(false);
    }
  }

  return <>
    <dl>
      {PROPERTIES.map((property) => {
        const value = ticket[property.key];
        const display = property.kind === "user"
          ? <LarkTicketResponsible responsible={value} />
          : <LarkTicketBadge kind={property.kind} value={value} />;
        const fieldOptions = options.fields.find((entry) => entry.field === property.field)?.options || [];
        return <div className="ticket-property" key={property.field}>
          <dt>{property.label}</dt>
          <dd>
            {canEdit ? <button className="ticket-property__edit" type="button" aria-label={`修改${property.label}`}
              aria-expanded={editing === property.field} disabled={saving}
              onClick={() => edit(property.field)}>{display}<span aria-hidden="true">⌄</span></button> : display}
            {canEdit && editing === property.field ? <form className="ticket-property__form" onSubmit={(event) => void save(event, property, fieldOptions)}>
              {options.status === "loading" ? <p role="status">正在加载选项…</p> : null}
              {options.status === "error" ? <p role="alert">选项加载失败。<button type="button" onClick={() => void loadOptions()}>重试</button></p> : null}
              {options.status === "ready" && !fieldOptions.length ? <p>无可修改的选项。</p> : null}
              {options.status === "ready" && fieldOptions.length ? <>
                <select autoFocus aria-label={`${property.label}新值`} value={selected} disabled={saving} onChange={(event) => setSelected(event.target.value)}>
                  <option value="" disabled>选择新值…</option>
                  {fieldOptions.map((option, index) => <option value={index} key={option.userId || option.label}>{option.label}{option.label === value ? "（当前）" : ""}</option>)}
                </select>
                <button type="submit" disabled={saving || selected === ""}>{saving ? "保存中…" : "保存"}</button>
              </> : null}
              <button type="button" disabled={saving} onClick={() => { setEditing(null); setMessage(null); }}>取消</button>
            </form> : null}
          </dd>
        </div>;
      })}
      {children}
    </dl>
    {message ? <p className={`ticket-property__message${message.error ? " ticket-property__message--error" : ""}`} role={message.error ? "alert" : "status"}>{message.text}</p> : null}
  </>;
}
