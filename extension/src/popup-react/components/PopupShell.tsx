import type { PropsWithChildren } from "react";

export function PopupShell({ children }: PropsWithChildren) {
  return (
    <section className="popup-shell" data-test="popup-shell">
      <div className="popup-shell__body">{children}</div>
    </section>
  );
}
