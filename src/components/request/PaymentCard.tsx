"use client";

import { useRouter } from "next/navigation";
import type { Request } from "@/types/request";

interface Props {
  request: Request;
  onApproveQuote?: () => void;
  approving?: boolean;
}

export default function PaymentCard({
  request,
  onApproveQuote,
  approving = false,
}: Props) {
  const router = useRouter();

  if (!request.quote) return null;

  // Admin approval required
  if (request.status === "review") {
    return (
      <Card>
        <h2 className="mb-2 text-xl font-semibold text-slate-950 dark:text-white">
          Quote Ready
        </h2>

        <p className="mb-6 text-slate-600 dark:text-slate-400">
          Your quotation is ready. Approve it to continue to payment.
        </p>

        <button
          onClick={onApproveQuote}
          disabled={approving}
          className="w-full rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 py-3 font-semibold text-white"
        >
          {approving ? "Approving..." : "Approve Quote"}
        </button>
      </Card>
    );
  }

  // Customer payment
  if (
    request.status === "awaiting_payment" &&
    !request.payment
  ) {
    return (
      <Card>
        <h2 className="mb-2 text-xl font-semibold text-slate-950 dark:text-white">
          Payment Required
        </h2>

        <p className="mb-6 text-slate-600 dark:text-slate-400">
          Your purchase invoice has been approved.
          Continue to complete your payment.
        </p>

        <button
          onClick={() =>
            router.push(`/payment/${request.id}`)
          }
          className="w-full rounded-xl bg-purple-600 hover:bg-purple-700 py-3 font-semibold text-white"
        >
          Continue to Payment
        </button>
      </Card>
    );
  }

  // Paid
  if (request.payment) {
    return (
      <Card>
        <div className="flex items-center gap-3 mb-4">

          <div className="w-3 h-3 rounded-full bg-green-500"/>

          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
            Payment Received
          </h2>

        </div>

        <p className="text-slate-600 dark:text-slate-400">
          We've received your payment.
          Our purchasing team will begin ordering your products shortly.
        </p>
      </Card>
    );
  }

  return null;
}

function Card({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      {children}
    </div>
  );
}