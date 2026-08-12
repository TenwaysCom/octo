export function User({ name, className = "" }) {
  const displayName = String(name || "").trim();
  if (!displayName) return "-";

  return <span className={`user ${className}`.trim()}>
    <span className="user__avatar" aria-hidden="true">{displayName.slice(0, 1)}</span>
    <span className="user__name">{displayName}</span>
  </span>;
}
