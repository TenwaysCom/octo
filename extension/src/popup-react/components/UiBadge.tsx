import type { PropsWithChildren } from "react";

export function UiBadge({
  tone = "default",
  children,
}: PropsWithChildren<{
  tone?: "success" | "processing" | "warning" | "error" | "default";
}>) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}
