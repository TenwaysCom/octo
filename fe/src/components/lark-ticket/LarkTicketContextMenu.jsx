import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildLarkTicketMenuSections,
  getLarkTicketMenuPosition,
} from "../../lib/lark-ticket-context-menu.js";


function MenuIcon({ name }) {
  const common = { "aria-hidden": true, className: "ticket-context-menu__icon", fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 1.5, viewBox: "0 0 16 16" };
  if (name === "open-base") return <svg {...common}><rect x="2" y="2" width="12" height="12" rx="2" /><path d="M2 6h12M6 6v8" /></svg>;
  if (name === "open-message") return <svg {...common}><path d="M3 2h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7l-4 3v-3H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" /><path d="M5 5h6M5 8h4" /></svg>;
  if (name === "status") return <svg {...common}><circle cx="8" cy="8" r="5.5" /><path d="M5.5 8.2 7.2 10l3.3-4" /></svg>;
  if (name === "responsible") return <svg {...common}><circle cx="8" cy="5.5" r="2.5" /><path d="M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" /></svg>;
  if (name === "requester") return <svg {...common}><circle cx="6.5" cy="5.5" r="2.5" /><path d="M1.8 13.5c.5-2.4 2.4-3.8 4.7-3.8 2.3 0 4.2 1.4 4.7 3.8" /><path d="M11.5 4.5h3M11.5 7.5h3" /></svg>;
  if (name === "priority") return <svg {...common}><path d="M3 13.5v-4M8 13.5v-7M13 13.5v-11" /></svg>;
  if (name === "issueType") return <svg {...common}><path d="m8 1.8 5.5 3.2v6L8 14.2l-5.5-3.2v-6z" /><path d="M8 5v6M5.2 6.7 8 8.5l2.8-1.8" /></svg>;
  if (name === "businessLine") return <svg {...common}><rect height="9.5" rx="1.5" width="12.5" x="1.8" y="4.5" /><path d="M5.5 4.5V3.2c0-.8.6-1.4 1.4-1.4h2.2c.8 0 1.4.6 1.4 1.4v1.3M1.8 8.5h12.5" /></svg>;
  return <svg {...common}><path d="M8 1.5 9.8 6l4.7.2-3.7 3 1.3 4.6L8 11.2l-4.1 2.6 1.3-4.6-3.7-3L6.2 6z" /></svg>;
}

function ChevronIcon() {
  return <svg aria-hidden="true" className="ticket-context-menu__chevron" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} viewBox="0 0 12 12"><path d="m4.5 2.5 4 3.5-4 3.5" /></svg>;
}

function CheckIcon() {
  return <svg aria-hidden="true" className="ticket-context-menu__check" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 12 12"><path d="m2 6.5 2.6 2.6L10 3.5" /></svg>;
}

function PersonAvatar({ label }) {
  return <span aria-hidden="true" className="ticket-context-menu__avatar">{label.slice(0, 1).toLocaleUpperCase()}</span>;
}

export function LarkTicketContextMenu({
  ticket,
  point,
  onlyField,
  items = [],
  fieldOptions = [],
  optionsStatus = "ready",
  actionStatus,
  createPending = false,
  onAction,
  onCreateMeegle,
  onOpenResource,
  onReloadOptions,
  onClose,
}) {
  const menuRef = useRef(null);
  const [activeIndexPath, setActiveIndexPath] = useState(onlyField ? { sectionIndex: 0, itemIndex: 0 } : null);
  const [query, setQuery] = useState("");
  const position = useMemo(
    () => getLarkTicketMenuPosition(point),
    [point],
  );
  const sections = useMemo(
    () => {
      const allSections = buildLarkTicketMenuSections({ ticket, fieldOptions, items });
      return onlyField ? [{ items: allSections[0].items.filter((item) => item.field === onlyField) }] : allSections;
    },
    [items, fieldOptions, ticket, onlyField],
  );
  const flatEntries = useMemo(() => {
    const entries = [];
    sections.forEach((section, sectionIndex) => {
      section.items.forEach((item, itemIndex) => {
        entries.push({ ...item, sectionIndex, itemIndex });
      });
    });
    return entries;
  }, [sections]);
  const activeIndex = flatEntries.findIndex((entry) => activeIndexPath
    && entry.sectionIndex === activeIndexPath.sectionIndex && entry.itemIndex === activeIndexPath.itemIndex);

  useEffect(() => { setQuery(""); }, [activeIndex, ticket.recordId, point]);

  useEffect(() => {
    const onMouseDown = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.stopPropagation();
        onClose();
      }
    };
    const onScroll = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose();
    };
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const createRunning = createPending || (actionStatus?.field === "create-meegle" && actionStatus.status === "running");
  useEffect(() => {
    (menuRef.current?.querySelector("input") || menuRef.current)?.focus();
  }, []);

  const runMenuAction = (item) => {
    if (item.disabled || (actionStatus?.field === item.kind && actionStatus.status === "running")) return;
    if (item.kind === "create-meegle") { if (!createRunning) onCreateMeegle?.(); }
    else onOpenResource?.(item.kind);
  };

  const runFieldAction = (item, option) => {
    if (actionStatus?.field === item.field && actionStatus.status === "running") return;
    onAction?.(item.field, option);
  };

  return <div className="ticket-context-menu-layer" role="presentation">
    <div
      aria-label="Ticket 快捷动作"
      className={`ticket-context-menu${onlyField ? " ticket-context-menu--field" : ""}`}
      ref={menuRef}
      role="menu"
      style={position}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const next = event.key === "ArrowDown"
            ? (activeIndex + 1 + flatEntries.length) % flatEntries.length
            : (activeIndex - 1 + flatEntries.length) % flatEntries.length;
          setActiveIndexPath(flatEntries[next]);
        }
        if ((event.key === "Enter" || event.key === "ArrowRight") && flatEntries[activeIndex]) {
          event.preventDefault();
          const entry = flatEntries[activeIndex];
          if (entry.kind !== "field") runMenuAction(entry);
          if (entry.kind === "field") menuRef.current?.querySelector(".ticket-context-menu__search")?.focus();
        }
      }}
    >
      {sections.map((section, sectionIndex) => <div className="ticket-context-menu__section" key={section.items[0]?.key}>
        {sectionIndex > 0 ? <hr className="ticket-context-menu__separator" /> : null}
        {section.items.map((item, itemIndex) => {
          const indexPath = { sectionIndex, itemIndex };
          const isActive = activeIndexPath?.sectionIndex === sectionIndex && activeIndexPath?.itemIndex === itemIndex;
          const isRunning = item.kind === "create-meegle"
            ? createRunning
            : actionStatus?.field === (item.field || item.kind) && actionStatus.status === "running";
          if (item.kind !== "field") {
            return <button
              aria-label={`${item.label}（当前 Ticket）`}
              className={`ticket-context-menu__item${isActive ? " ticket-context-menu__item--active" : ""}`}
              key={item.key}
              disabled={isRunning || item.disabled}
              title={item.kind === "open-message" && item.disabled ? "当前 Ticket 没有关联 Lark 消息" : undefined}
              role="menuitem"
              type="button"
              onFocus={() => setActiveIndexPath(indexPath)}
              onMouseEnter={() => setActiveIndexPath(null)}
              onClick={() => runMenuAction(item)}
            >
              <MenuIcon name={item.kind} />
              <span className="ticket-context-menu__label">{item.label}</span>
              {isRunning ? <span className="ticket-context-menu__pending" aria-hidden="true">…</span> : null}
            </button>;
          }
          const visibleOptions = item.options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
          return <div
            className={`ticket-context-menu__item ticket-context-menu__item--expandable${isActive ? " ticket-context-menu__item--active" : ""}${isActive ? " ticket-context-menu__item--open" : ""}`}
            key={item.key}
            onMouseEnter={() => setActiveIndexPath(indexPath)}
          >
            {!onlyField ? <button
              aria-haspopup="menu"
              aria-expanded={isActive ? true : undefined}
              className="ticket-context-menu__item-button"
              disabled={isRunning}
              role="menuitem"
              tabIndex={-1}
              type="button"
              onFocus={() => setActiveIndexPath(indexPath)}
              onClick={() => setActiveIndexPath(indexPath)}
            >
              <MenuIcon name={item.field} />
              <span className="ticket-context-menu__label">{item.label}</span>
              {isRunning ? <span className="ticket-context-menu__pending" aria-hidden="true">…</span> : <ChevronIcon />}
            </button> : null}
            {isActive ? <div aria-label={item.submenuTitle} className={`ticket-context-menu__submenu${position.flipSubmenu ? " ticket-context-menu__submenu--flip" : ""}`} role="menu"
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.nativeEvent.isComposing) return;
                const input = event.target.tagName === "INPUT";
                if (input && ["Home", "End"].includes(event.key)) return;
                if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                  event.preventDefault();
                  const buttons = [...event.currentTarget.querySelectorAll('.ticket-context-menu__option:not(:disabled)')];
                  const current = buttons.indexOf(document.activeElement);
                  const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
                    : event.key === "ArrowDown" ? (current + 1) % buttons.length
                      : (current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length);
                  buttons[next]?.focus();
                }
              }}>
              <div className="ticket-context-menu__search-header">
                <input autoFocus className="ticket-context-menu__search" type="text" aria-label={`搜索${item.label}选项`}
                  placeholder={`${item.submenuTitle} 搜索`} autoComplete="off" value={query}
                  onChange={(event) => setQuery(event.target.value)} />
              </div>
              {optionsStatus === "loading" ? <p className="ticket-context-menu__submenu-note">正在加载选项…</p> : null}
              {optionsStatus === "error" ? <p className="ticket-context-menu__submenu-note">
                选项加载失败。
                <button type="button" onClick={onReloadOptions}>重试</button>
              </p> : null}
              {optionsStatus === "ready" ? visibleOptions.map((option) => <button
                aria-current={option.isCurrent || undefined}
                className={`ticket-context-menu__option${option.isCurrent ? " ticket-context-menu__option--current" : ""}`}
                key={`${option.userId || option.label}`}
                role="menuitem"
                type="button"
                disabled={isRunning}
                onClick={() => runFieldAction(item, option)}
              >
                {item.optionsKind === "user"
                  ? <PersonAvatar label={option.label} />
                  : <span aria-hidden="true" className={`ticket-context-menu__dot ticket-context-menu__dot--${option.tone}`} />}
                <span className="ticket-context-menu__label">{option.label}</span>
                <small className="ticket-context-menu__count">{option.count}</small>
                {option.isCurrent ? <CheckIcon /> : null}
              </button>) : null}
              {optionsStatus === "ready" && item.options.length > 0 && !visibleOptions.length ? <p className="ticket-context-menu__submenu-note" role="status">没有匹配的选项。</p> : null}
              {optionsStatus === "ready" && !item.options.length ? <p className="ticket-context-menu__submenu-note">（无可修改的选项）</p> : null}
            </div> : null}
          </div>;
        })}
      </div>)}
    </div>
  </div>;
}
