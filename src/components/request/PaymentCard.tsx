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
        <h2 className="text-xl font-semibold text-white mb-2">
          Quote Ready
        </h2>

        <p className="text-slate-400 mb-6">
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
        <h2 className="text-xl font-semibold text-white mb-2">
          Payment Required
        </h2>

        <p className="text-slate-400 mb-6">
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

          <h2 className="text-xl font-semibold text-white">
            Payment Received
          </h2>

        </div>

        <p className="text-slate-400">
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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
      {children}
    </div>
  );
}