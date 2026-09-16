import type { PropsWithChildren, ReactNode } from "react";

export function UiCard({
  title,
  actions,
  children,
}: PropsWithChildren<{
  title?: string;
  actions?: ReactNode;
}>) {
  return (
    <section className="ui-card">
      {(title || actions) && (
        <header className="ui-card__header">
          {title ? <h3 className="ui-card__title">{title}</h3> : <div />}
          {actions ? <div className="ui-card__actions">{actions}</div> : null}
        </header>
      )}
      <div className="ui-card__body">{children}</div>
    </section>
  );
}
