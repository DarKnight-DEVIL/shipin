import Link from "next/link";
import { ArrowRight, AlertCircle, CreditCard } from "lucide-react";
import type { Request } from "@/types/request";

interface AttentionRowProps {
  request: Request;
}

export default function AttentionRow({ request }: AttentionRowProps) {
  const mainPayment =
    request.status === "awaiting_payment" && !request.payment;
  const additionalPayment =
    request.additionalItemRequests?.some(
      (i) => i.status === "awaiting_payment"
    ) ?? false;

  let title = "Action required";
  let description = "Open this request to continue.";
  let cta = "Open";

  if (request.status === "review") {
    title = "Quote ready to review";
    description = "Approve your quote to move this request forward.";
    cta = "Review";
  } else if (mainPayment) {
    title = "Payment due";
    description = "Your approved request is waiting for payment.";
    cta = "Pay now";
  } else if (additionalPayment) {
    title = "Extra item needs payment";
    description = "An approved additional item is awaiting payment.";
    cta = "Pay now";
  }

  const Icon = mainPayment || additionalPayment ? CreditCard : AlertCircle;

  return (
    <Link
      href={`/requests/${request.id}`}
      className="dash-attention-row group flex items-center gap-3.5 px-5 py-3 transition-colors"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent-solid)_14%,transparent)] text-[var(--accent)]">
        <Icon size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-[13px] font-medium text-[var(--foreground)]">
          <span className="truncate">{title}</span>
          <span className="shrink-0 font-mono text-[10px] font-normal text-[var(--muted)]">
            #{request.id.slice(0, 6).toUpperCase()}
          </span>
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">
          {description}
        </p>
      </div>

      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent-solid)] px-3 py-1.5 text-[11px] font-semibold text-[#1a0b02]">
        {cta}
        <ArrowRight size={12} className="dash-arrow" />
      </span>
    </Link>
  );
}
