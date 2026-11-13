import type {
  SupportMessage as SupportMessageType,
} from "@/types/support";

interface Props {
  message: SupportMessageType;
}

export default function SupportMessage({
  message,
}: Props) {
  const customer =
    message.sender === "customer";

  return (
    <div
      className={`rounded-xl border p-4 ${
        customer
          ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
          : "border-purple-500/20 bg-purple-50 dark:bg-purple-900/20"
      }`}
    >
      <div
        className={`mb-2 text-sm font-medium ${
          customer
            ? "text-slate-500 dark:text-slate-400"
            : "text-purple-600 dark:text-purple-400"
        }`}
      >
        {customer ? "You" : "ShipIN"}
      </div>

      <div className="whitespace-pre-wrap text-slate-900 dark:text-white">
        {message.message}
      </div>
    </div>
  );
}