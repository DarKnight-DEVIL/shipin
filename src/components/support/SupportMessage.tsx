import type {
  SupportMessage as SupportMessageType,
} from "@/types/support";

interface Props {
  message: SupportMessageType;
}

export default function SupportMessage({
  message,
}: Props) {
  const customer = message.sender === "customer";

  return (
    <div
      className={`rounded-xl p-4 ${
        customer
          ? "bg-slate-950"
          : "bg-purple-900/20 border border-purple-700"
      }`}
    >
      <div className="text-sm text-slate-400 mb-2">
        {customer ? "You" : "ShipIN"}
      </div>

      <div className="text-white whitespace-pre-wrap">
        {message.message}
      </div>
    </div>
  );
}