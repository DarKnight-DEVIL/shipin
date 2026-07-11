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
      "bg-blue-500/10 border-blue-500/20 text-blue-300",

    warning:
      "bg-amber-500/10 border-amber-500/20 text-amber-300",

    success:
      "bg-green-500/10 border-green-500/20 text-green-300",

    error:
      "bg-red-500/10 border-red-500/20 text-red-300",
  };

  return (
    <div
      className={`rounded-xl border p-4 ${styles[variant]}`}
    >
      {children}
    </div>
  );
}