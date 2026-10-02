import React from "react";

type Variant =
  | "primary"
  | "secondary"
  | "danger"
  | "success";

interface Props
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: Variant;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-purple-600 hover:bg-purple-700 text-white",

  secondary:
    "bg-slate-700 hover:bg-slate-600 text-white",

  danger:
    "bg-red-600 hover:bg-red-700 text-white",

  success:
    "bg-green-600 hover:bg-green-700 text-white",
};

export default function ActionButton({
  children,
  loading = false,
  variant = "primary",
  className = "",
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`
        px-5 py-3 rounded-xl font-semibold transition
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden="true"
          />
          <span>Processing...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}