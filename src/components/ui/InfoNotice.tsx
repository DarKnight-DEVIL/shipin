"use client";

interface Props {
  children: React.ReactNode;

  variant?:
    | "info"
    | "warning"
    | "success"
    | "error";
}

export default function InfoNotice({
  children,
  variant = "info",
}: Props) {
  const styles = {
    info:
      "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300",

    warning:
      "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",

    success:
      "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300",

    error:
      "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
  };

  return (
    <div
      className={`rounded-xl border p-4 ${styles[variant]}`}
    >
      {children}
    </div>
  );
}