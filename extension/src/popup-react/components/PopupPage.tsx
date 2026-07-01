import type { PropsWithChildren, ReactNode } from "react";

export function PopupPage({
  title,
  subtitle,
  actions,
  footer,
  children,
}: PropsWithChildren<{
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  footer?: ReactNode;
}>) {
  return (
    <section className="popup-page" data-test="popup-page">
      {(title || subtitle) && (
        <header className="popup-page__header">
          <div className="popup-page__copy">
            {title ? <h2 className="popup-page__title">{title}</h2> : null}
            {subtitle ? <p className="popup-page__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="popup-page__actions">{actions}</div> : null}
        </header>
      )}
      <div className="popup-page__body">{children}</div>
      {footer ? <footer className="popup-page__footer">{footer}</footer> : null}
    </section>
  );
}
