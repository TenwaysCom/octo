import { useRef, useState } from "react";
import { flattenMeegleRelatedPeople, formatMeegleRelatedPeopleLabel } from "../../lib/meegle-related-people.js";

const INLINE_LIMIT = 2;

export function MeegleRelatedPeople({ relatedPeople }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const entries = flattenMeegleRelatedPeople(relatedPeople);
  if (!entries.length) return "-";

  const label = formatMeegleRelatedPeopleLabel(relatedPeople);
  const visible = entries.slice(0, INLINE_LIMIT);
  const overflowCount = entries.length - visible.length;
  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)),
        top: Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - 220)),
      });
    }
    setOpen((value) => !value);
  }

  return <span
    aria-label={label}
    className="meegle-related-people"
    title={label}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); buttonRef.current?.focus(); } }}
  >
    {visible.map((entry) => <span className="meegle-related-people__entry" key={`${entry.roleKey}:${entry.memberKey}`}><small>{entry.roleName}</small><span>{entry.name}</span></span>)}
    {overflowCount > 0 ? <button
      aria-expanded={open}
      aria-label={`相关人共 ${entries.length} 项，展开查看全部`}
      className="meegle-related-people__toggle"
      ref={buttonRef}
      type="button"
      onClick={toggle}
    >+{overflowCount}</button> : null}
    {open ? <span aria-label="全部相关人" className="meegle-related-people__popover" role="group" style={position}>
      {relatedPeople.map((role) => <span className="meegle-related-people__role" key={role.roleKey}>
        <strong>{role.roleName}</strong>
        <span>{role.members.map((member) => member.name).join("、")}</span>
      </span>)}
    </span> : null}
  </span>;
}
