import React from "react";

type Variant = "primary" | "secondary" | "danger" | "success" | "ghost";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  block?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary: "app-btn-primary",
  secondary: "app-btn-secondary",
  danger: "app-btn-danger",
  success: "app-btn-primary",
  ghost: "app-btn-ghost",
};

const sizeStyles = {
  sm: "app-btn-sm",
  md: "",
  lg: "app-btn-lg",
};

export default function ActionButton({
  children,
  loading = false,
  variant = "primary",
  size = "md",
  block = false,
  className = "",
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`app-btn ${variantStyles[variant]} ${sizeStyles[size]} ${
        block ? "app-btn-block" : ""
      } ${className}`}
    >
      {loading ? (
        <>
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden="true"
          />
          <span>Processing…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
