import type { ButtonHTMLAttributes, ReactNode } from "react";

interface SettingsButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function PrimaryButton({
  children,
  ...props
}: SettingsButtonProps) {
  return (
    <button
      {...props}
      className={`app-btn app-btn-primary ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  ...props
}: SettingsButtonProps) {
  return (
    <button
      {...props}
      className={`app-btn app-btn-secondary ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
