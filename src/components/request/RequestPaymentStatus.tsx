"use client";

import { useRouter } from "next/navigation";
import {
  Wallet,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

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

  if (!request.quote) {
    return null;
  }

  /*
   * ========================================
   * ADMIN APPROVAL REQUIRED
   * ========================================
   */

  if (request.status === "review") {
    return (
      <Card>
        <h2 className="mb-2 text-xl font-semibold text-slate-950 dark:text-white">
          Quote Ready
        </h2>

        <p className="mb-6 text-slate-600 dark:text-slate-400">
          Your quotation is ready. Approve it
          to continue to payment.
        </p>

        <button
          onClick={onApproveQuote}
          disabled={approving}
          className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {approving
            ? "Approving..."
            : "Approve Quote"}
        </button>
      </Card>
    );
  }

  /*
   * ========================================
   * CUSTOMER PAYMENT REQUIRED
   * ========================================
   */

  if (
    request.status ===
      "awaiting_payment" &&
    !request.payment
  ) {
    return (
      <Card>
        <h2 className="mb-2 text-xl font-semibold text-slate-950 dark:text-white">
          Payment Required
        </h2>

        <p className="mb-6 text-slate-600 dark:text-slate-400">
          Your purchase invoice has been
          approved. Continue to complete
          your payment.
        </p>

        <button
          onClick={() =>
            router.push(
              `/payment/${request.id}`
            )
          }
          className="w-full rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-700"
        >
          Continue to Payment
        </button>
      </Card>
    );
  }

  /*
   * ========================================
   * PAYMENT RECEIVED
   * ========================================
   */

  if (request.payment) {
    const payment =
      request.payment as {
        paymentMethod?: string;
        provider?: string;
        amountPaid?: number;
        amount?: number;
        walletAmount?: number;
        paypalAmount?: number;
        currency?: string;
        status?: string;
        paidAt?: any;
      };

    const paymentMethod =
      payment.paymentMethod ||
      payment.provider ||
      "paypal";

    const walletAmount =
      Number(
        payment.walletAmount || 0
      );

    const paypalAmount =
      Number(
        payment.paypalAmount || 0
      );

    const totalPaid =
      Number(
        payment.amountPaid ??
          payment.amount ??
          0
      );

    /*
     * Friendly payment method label.
     */

    let paymentMethodLabel =
      "PayPal";

    if (
      paymentMethod ===
      "wallet"
    ) {
      paymentMethodLabel =
        "Wallet";
    }

    if (
      paymentMethod ===
        "wallet_and_paypal" ||
      paymentMethod ===
        "paypal_and_wallet"
    ) {
      paymentMethodLabel =
        "Wallet + PayPal";
    }

    return (
      <Card>
        {/* SUCCESS HEADER */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle2
              size={22}
              className="text-green-500"
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
              Payment Received
            </h2>

            <p className="text-sm text-green-600 dark:text-green-400">
              Payment completed successfully
            </p>
          </div>
        </div>

        <p className="mb-6 text-slate-600 dark:text-slate-400">
          We've received your payment.
          Our purchasing team will begin
          ordering your products shortly.
        </p>

        {/* PAYMENT DETAILS */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/40">

          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Payment Details
          </h3>

          <div className="space-y-4">

            {/* PAYMENT METHOD */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Payment Method
              </span>

              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">

                {paymentMethod ===
                  "wallet" && (
                  <Wallet
                    size={17}
                    className="text-blue-500"
                  />
                )}

                {(paymentMethod ===
                  "paypal" ||
                  paymentMethod ===
                    "wallet_and_paypal" ||
                  paymentMethod ===
                    "paypal_and_wallet") && (
                  <CreditCard
                    size={17}
                    className="text-purple-500"
                  />
                )}

                <span>
                  {paymentMethodLabel}
                </span>
              </div>
            </div>

            {/* WALLET */}
            {walletAmount >
              0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Wallet Used
                </span>

                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  -$
                  {walletAmount.toFixed(
                    2
                  )}
                </span>
              </div>
            )}

            {/* PAYPAL */}
            {paypalAmount >
              0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  PayPal Paid
                </span>

                <span className="font-semibold text-slate-900 dark:text-white">
                  $
                  {paypalAmount.toFixed(
                    2
                  )}
                </span>
              </div>
            )}

            {/* TOTAL */}
            <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Total Paid
                </span>

                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  $
                  {totalPaid.toFixed(
                    2
                  )}
                </span>
              </div>
            </div>

          </div>
        </div>

      </Card>
    );
  }

  return null;
}

/*
 * ========================================
 * CARD
 * ========================================
 */

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