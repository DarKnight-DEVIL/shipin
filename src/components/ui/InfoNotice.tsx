"use client";

interface Props {
  children: React.ReactNode;

  variant?: "info" | "warning" | "success" | "error";
}

export default function InfoNotice({
  children,
  variant = "info",
}: Props) {
  const styles = {
    info:
      "border-blue-200/80 bg-blue-50/70 text-blue-900 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-200",

    warning:
      "border-amber-200/80 bg-amber-50/70 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200",

    success:
      "border-emerald-200/80 bg-emerald-50/70 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200",

    error:
      "border-rose-200/80 bg-rose-50/70 text-rose-900 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200",
  };

  return (
    <div
      className={`rounded-lg border px-3.5 py-3 text-[13px] leading-6 ${styles[variant]}`}
    >
      {children}
    </div>
  );
}
