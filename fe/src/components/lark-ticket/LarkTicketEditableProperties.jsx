import { createPortal } from "react-dom";
import { getLarkTicketOptionTone, isCurrentLarkTicketOption } from "../../lib/lark-ticket-context-menu.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const [query, setQuery] = useState("");
  const searchInput = useRef(null);
  const [options, setOptions] = useState({ status: "idle", fields: [] });
  const [position, setPosition] = useState(null);
  const anchor = useRef(null);
  const menu = useRef(null);
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

  function close(restoreFocus = false) {
    setEditing(null);
    if (restoreFocus) anchor.current?.focus();
  }

  useLayoutEffect(() => {
    if (!editing || !anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const width = Math.min(240, window.innerWidth - 24);
    const height = Math.min(360, Math.max(120, window.innerHeight - 24));
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: rect.bottom + height + 6 <= window.innerHeight - 12 ? rect.bottom + 6 : Math.max(12, rect.top - height - 6),
      width, maxHeight: height });
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    searchInput.current?.focus();
    const outside = (event) => {
      if (!menu.current?.contains(event.target) && !anchor.current?.contains(event.target)) close();
    };
    const scroll = (event) => { if (!menu.current?.contains(event.target)) close(); };
    const resize = () => close();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [editing]);

  function edit(field, button) {
    if (!canEdit || running.current) return;
    setQuery("");
    anchor.current = button;
    setEditing((current) => current === field ? null : field);
    setMessage(null);
    if (options.status !== "ready" && options.status !== "loading") void loadOptions();
  }

  async function save(property, option) {
    if (!canEdit || running.current || !option) return;
    if (property.kind !== "user" && isCurrentLarkTicketOption(ticket, property.field, option.label)) {
      close(true);
      return;
    }
    running.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const result = await updateLarkTicketField({ apiBaseUrl, ticket, field: property.field,
        value: option.label, optionUserId: option.userId, actionRunId: crypto.randomUUID() });
      if (result.ticket) onUpdated(result.ticket);
      close(true);
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
        const normalizedQuery = query.trim().toLocaleLowerCase();
        const visibleOptions = fieldOptions.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery));
        return <div className="ticket-property" key={property.field}>
          <dt>{property.label}</dt>
          <dd>
            {canEdit ? <button className="ticket-property__edit" type="button" aria-label={`修改${property.label}`}
              aria-haspopup="menu" aria-expanded={editing === property.field} disabled={saving}
              onClick={(event) => edit(property.field, event.currentTarget)}>{display}<span aria-hidden="true">⌄</span></button> : display}
            {canEdit && editing === property.field && position ? createPortal(
              <div className="ticket-property-menu" ref={menu} style={position} role="menu" aria-label={`修改${property.label}`} tabIndex={-1}
                aria-busy={saving}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  const inSearch = event.target === searchInput.current;
                  if (inSearch && ["Home", "End"].includes(event.key)) return;
                  if (event.key === "Escape") { event.preventDefault(); close(true); }
                  if (event.key === "Tab") { close(true); }
                  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                    event.preventDefault();
                    const buttons = [...menu.current.querySelectorAll('[role="menuitemradio"]:not(:disabled)')];
                    const current = buttons.indexOf(document.activeElement);
                    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
                      : event.key === "ArrowDown" ? (current + 1) % buttons.length
                        : (current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length);
                    buttons[index]?.focus();
                  }
                }}>
                <div className="ticket-property-menu__heading">
                  <input ref={searchInput} autoFocus type="text" className="ticket-property-menu__search"
                    aria-label={`搜索${property.label}选项`} placeholder={`搜索${property.label}…`}
                    value={query} disabled={saving} autoComplete="off"
                    onChange={(event) => setQuery(event.target.value)} />
                  <kbd>Esc</kbd>
                </div>
                <div className="ticket-property-menu__options">
                  {options.status === "loading" ? <p className="ticket-property-menu__note" role="status">正在加载选项…</p> : null}
                  {options.status === "error" ? <p className="ticket-property-menu__note" role="alert">选项加载失败。<button type="button" onClick={() => void loadOptions()}>重试</button></p> : null}
                  {options.status === "ready" && !fieldOptions.length ? <p className="ticket-property-menu__note">无可修改的选项。</p> : null}
                  {options.status === "ready" && fieldOptions.length > 0 && !visibleOptions.length ? <p className="ticket-property-menu__note" role="status">没有匹配的选项。</p> : null}
                  {options.status === "ready" ? visibleOptions.map((option) => {
                    const current = isCurrentLarkTicketOption(ticket, property.field, option.label);
                    return <button type="button" role="menuitemradio" aria-checked={current}
                      className="ticket-property-menu__option" key={option.userId || option.label} disabled={saving}
                      onClick={() => void save(property, option)}>
                      {property.kind === "user" ? <span className="ticket-context-menu__avatar" aria-hidden="true">{option.label.slice(0, 1)}</span>
                        : <span className={`ticket-context-menu__dot ticket-context-menu__dot--${getLarkTicketOptionTone(property.field, option.label)}`} aria-hidden="true" />}
                      <span className="ticket-property-menu__label">{option.label}</span>
                      {current ? <svg className="ticket-property-menu__check" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg> : null}
                    </button>;
                  }) : null}
                </div>
                {saving ? <p className="ticket-property-menu__note" role="status">正在保存…</p> : null}
                {message?.error ? <p className="ticket-property-menu__note ticket-property__message--error" role="alert">{message.text}</p> : null}
              </div>, document.body) : null}
          </dd>
        </div>;
      })}
      {children}
    </dl>
    {message && !editing ? <p className={`ticket-property__message${message.error ? " ticket-property__message--error" : ""}`} role={message.error ? "alert" : "status"}>{message.text}</p> : null}
  </>;
}
