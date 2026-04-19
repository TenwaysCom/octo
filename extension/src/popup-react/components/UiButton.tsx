import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type UiButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "primary" | "ghost";
    size?: "sm" | "md";
    block?: boolean;
  }
>;

export function UiButton({
  variant = "default",
  size = "md",
  block = false,
  className,
  type = "button",
  children,
  ...props
}: UiButtonProps) {
  return (
    <button
      type={type}
      className={[
        "ui-button",
        `ui-button--${variant}`,
        `ui-button--${size}`,
        block ? "ui-button--block" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
