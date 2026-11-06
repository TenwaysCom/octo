import { useState } from "react";

export function UserAvatar({ name, avatarUrl, className = "user__avatar" }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const showImage = typeof avatarUrl === "string" && /^https?:\/\//i.test(avatarUrl) && failedUrl !== avatarUrl;
  return <span className={className} aria-hidden="true">
    {showImage ? <img src={avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(avatarUrl)} /> : String(name || "").slice(0, 1)}
  </span>;
}

export function User({ name, avatarUrl, className = "" }) {
  const displayName = String(name || "").trim();
  if (!displayName) return "-";

  return <span className={`user ${className}`.trim()}>
    <UserAvatar name={displayName} avatarUrl={avatarUrl} />
    <span className="user__name">{displayName}</span>
  </span>;
}
