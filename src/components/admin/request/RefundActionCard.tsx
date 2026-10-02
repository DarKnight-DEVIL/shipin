"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import {
  Wallet,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import { db } from "@/lib/firebase";
import type { Request } from "@/types/request";

interface Props {
  request: Request;
}

type RefundPreference =
  | "wallet"
  | "original_payment";

export default function RequestDetailsView({ request }: Props) {
  return (
    <div className="space-y-8">
      {/* REFUND ACTION â€” TOP PRIORITY */}
      <RefundActionCard request={request} />
    </div>
  );
}

/*
 * ========================================
 * REFUND ACTION CARD COMPONENT
 * ========================================
 */

function RefundActionCard({ request }: Props) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [partialRefundOpen, setPartialRefundOpen] = useState(false);
  const [partialRefundAmount, setPartialRefundAmount] = useState("");
  const [partialRefundReason, setPartialRefundReason] = useState("");
  async function handlePartialRefundOffer() {
    if (processing) {
      return;
    }

    const amount = Number(partialRefundAmount);
    const reason = partialRefundReason.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid partial refund amount.");
      return;
    }

    if (!reason) {
      toast.error("A refund reason is required.");
      return;
    }

    try {
      setProcessing(true);

      const response = await fetch(
        `/api/admin/requests/${request.id}/partial-refund`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount,
            reason,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to offer partial refund."
        );
      }

      toast.success(
        `$${amount.toFixed(2)} partial refund offered to the customer.`
      );

      setPartialRefundAmount("");
      setPartialRefundReason("");
      setPartialRefundOpen(false);

      router.refresh();
    } catch (error) {
      console.error(
        "Partial refund offer error:",
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to offer partial refund."
      );
    } finally {
      setProcessing(false);
    }
  }

  const [
    paypalRefundTransactionId,
    setPaypalRefundTransactionId,
  ] = useState("");
  /*
   * Only display this card when a customer
   * has actually requested a refund.
   */
  if (request.refundRequest?.status !== "requested") {
    return null;
  }

  const refundRequest = request.refundRequest;

  const preference = refundRequest.preference as
    | RefundPreference
    | undefined;

  const payment = request.payment as
    | {
        amount?: number;
        amountPaid?: number;
        walletAmount?: number;
        paypalAmount?: number;
        currency?: string;
      }
    | undefined;

  const totalPaid = Number(
    payment?.amountPaid ??
      payment?.amount ??
      refundRequest.amount ??
      0
  );

  const originalWalletAmount = Number(payment?.walletAmount ?? 0);
  const originalPaypalAmount = Number(payment?.paypalAmount ?? 0);

  /*
   * ========================================
   * REFUND AMOUNTS
   * ========================================
   */

  let walletRefund = 0;
  let paypalRefund = 0;

  if (preference === "wallet") {
    /*
     * Customer wants the ENTIRE refund
     * in their ShipIN Wallet.
     */
    walletRefund = totalPaid;
  }

  if (preference === "original_payment") {
    /*
     * Customer wants the refund sent back
     * to the original payment method.
     *
     * If PayPal was used, the PayPal amount
     * must be manually refunded through
     * PayPal support.
     */
    paypalRefund = originalPaypalAmount;

    /*
     * Wallet-only original payments can
     * simply return to the wallet.
     */
    walletRefund = originalWalletAmount;
  }

  /*
   * ========================================
   * WALLET REFUND NAVIGATION
   * ========================================
   */

  function openWalletRefund() {
    router.push(`/admin/wallet?refundRequest=${request.id}`);
  }

  /*
   * ========================================
   * PAYPAL CONFIRMATION
   * ========================================
   */

  async function confirmPaypalRefund() {
    if (processing || paypalRefund <= 0) {
      return;
    }

    const transactionId = paypalRefundTransactionId.trim();

    if (!transactionId) {
      toast.error("PayPal refund transaction ID is required.");
      return;
    }

    try {
      setProcessing(true);

      const requestRef = doc(
        db,
        "requests",
        request.id
      );

      await updateDoc(requestRef, {
        "refundRequest.paypalRefundStatus":
          "completed",

        "refundRequest.paypalRefundAmount":
          paypalRefund,

        "refundRequest.paypalRefundTransactionId":
          transactionId,

        "refundRequest.paypalRefundedAt":
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),
      });

      toast.success("PayPal refund recorded.");
    } catch (error) {
      console.error(
        "Failed to record PayPal refund:",
        error
      );

      toast.error("Unable to record PayPal refund.");
    } finally {
      setProcessing(false);
    }
  }

  /*
   * ========================================
   * STATUS HELPERS
   * ========================================
   */

  const walletCompleted = refundRequest.walletStatus === "completed";
  const paypalCompleted = refundRequest.paypalRefundStatus === "completed";
  async function completeRefund() {
    if (processing) {
      return;
    }

    const walletDone = walletRefund <= 0 || walletCompleted;
    const paypalDone = paypalRefund <= 0 || paypalCompleted;

    if (!walletDone || !paypalDone) {
      toast.error("Complete all required refund portions first.");
      return;
    }

    try {
      setProcessing(true);

      const requestRef = doc(db, "requests", request.id);

      await updateDoc(requestRef, {
        "refundRequest.status": "completed",
        "refundRequest.processedAt": serverTimestamp(),
        status: "refunded",
        "statusHistory.refunded": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success("Refund completed successfully.");
    } catch (error) {
      console.error("Failed to complete refund:", error);
      toast.error("Unable to complete refund.");
    } finally {
      setProcessing(false);
    }
  }

  

    /*
   * ========================================
   * PREFERENCE LABEL
   * ========================================
   */

  const preferenceLabel =
    preference === "wallet"
      ? "ShipIN Wallet"
      : preference === "original_payment"
      ? "Original Payment Method"
      : preference === "original_sources"
      ? "Original Payment Sources"
      : "Not recorded";

  /*
   * ========================================
   * RENDER
   * ========================================
   */

  return (
    <div
      className="
        rounded-2xl
        border
        border-red-500/30
        bg-red-500/5
        p-6
        dark:bg-red-500/[0.04]
      "
    >
      {/* HEADER */}
      <div
        className="
          flex
          flex-col
          gap-4
          sm:flex-row
          sm:items-start
          sm:justify-between
        "
      >
        <div className="flex gap-3">
          <div
            className="
              flex
              h-10
              w-10
              shrink-0
              items-center
              justify-center
              rounded-xl
              bg-red-500/10
              text-red-400
            "
          >
            <AlertTriangle size={21} />
          </div>

          <div>
            <h2
              className="
                text-xl
                font-bold
                text-red-600
                dark:text-red-400
              "
            >
              Refund Required
            </h2>

            <p
              className="
                mt-1
                text-sm
                text-slate-500
                dark:text-slate-400
              "
            >
              Customer has requested a refund. Admin action is required.
            </p>
          </div>
        </div>

        <div
          className="
            rounded-full
            border
            border-red-500/30
            bg-red-500/10
            px-4
            py-2
            text-sm
            font-semibold
            text-red-400
          "
        >
          Refund Requested
        </div>
      </div>

      {/* REFUND SUMMARY */}
      <div
        className="
          mt-6
          grid
          grid-cols-1
          gap-4
          md:grid-cols-3
        "
      >
        <RefundDetail label="Refund Preference" value={preferenceLabel} />
        <RefundDetail label="Total Refund" value={`$${totalPaid.toFixed(2)}`} />
        <RefundDetail label="Currency" value={payment?.currency || "USD"} />
      </div>

      {/* WALLET REFUND */}
      {walletRefund > 0 && (
        <div
          className="
            mt-6
            rounded-xl
            border
            border-blue-500/20
            bg-blue-500/5
            p-5
          "
        >
          <div
            className="
              flex
              items-start
              justify-between
              gap-4
            "
          >
            <div className="flex gap-3">
              <Wallet
                size={21}
                className="
                  mt-0.5
                  shrink-0
                  text-blue-400
                "
              />

              <div>
                <h3
                  className="
                    font-semibold
                    text-slate-900
                    dark:text-white
                  "
                >
                  Wallet Refund
                </h3>

                <p
                  className="
                    mt-1
                    text-sm
                    text-slate-500
                    dark:text-slate-400
                  "
                >
                  Amount to credit to the customer's ShipIN Wallet.
                </p>
              </div>
            </div>

            <span
              className="
                text-lg
                font-bold
                text-blue-500
              "
            >
              +${walletRefund.toFixed(2)}
            </span>
          </div>

          <div className="mt-4">
            {walletCompleted ? (
              <div
                className="
                  flex
                  items-center
                  gap-2
                  rounded-xl
                  bg-green-500/10
                  px-4
                  py-3
                  text-sm
                  font-semibold
                  text-green-500
                "
              >
                <CheckCircle2 size={18} />
                Wallet refund authorized
              </div>
            ) : (
              <button
                type="button"
                onClick={openWalletRefund}
                disabled={processing}
                className="
                  flex
                  w-full
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  bg-blue-600
                  px-5
                  py-3
                  font-semibold
                  text-white
                  transition
                  hover:bg-blue-700
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
              >
                <Wallet size={18} />
                Process ${walletRefund.toFixed(2)} Wallet Refund
              </button>
            )}
          </div>
        </div>
      )}

      {/* PAYPAL REFUND */}
      {paypalRefund > 0 && (
        <div
          className="
            mt-4
            rounded-xl
            border
            border-purple-500/20
            bg-purple-500/5
            p-5
          "
        >
          <div
            className="
              flex
              items-start
              justify-between
              gap-4
            "
          >
            <div className="flex gap-3">
              <CreditCard
                size={21}
                className="
                  mt-0.5
                  shrink-0
                  text-purple-400
                "
              />

              <div>
                <h3
                  className="
                    font-semibold
                    text-slate-900
                    dark:text-white
                  "
                >
                  PayPal Refund
                </h3>

                <p
                  className="
                    mt-1
                    text-sm
                    text-slate-500
                    dark:text-slate-400
                  "
                >
                  Contact PayPal Support and complete the refund manually.
                </p>
              </div>
            </div>

            <span
              className="
                text-lg
                font-bold
                text-purple-500
              "
            >
              ${paypalRefund.toFixed(2)}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {paypalCompleted ? (
              <div
                className="
                  rounded-xl
                  bg-green-500/10
                  px-4
                  py-4
                  text-sm
                  text-green-500
                "
              >
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 size={18} />
                  PayPal refund recorded
                </div>

                <div className="mt-3 space-y-1 text-xs">
                  <p className="text-slate-400">
                    Refund Amount:{" "}
                    <span className="font-semibold text-slate-200">
                      ${paypalRefund.toFixed(2)}
                    </span>
                  </p>

                  <p className="text-slate-400">
                    PayPal Transaction ID:{" "}
                    <span className="font-mono font-semibold text-slate-200">
                      {refundRequest.paypalRefundTransactionId ||
                        "Not recorded"}
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="PayPal Refund Transaction ID *"
                  value={paypalRefundTransactionId}
                  onChange={(e) => setPaypalRefundTransactionId(e.target.value)}
                  disabled={processing}
                  className="
                    w-full
                    rounded-xl
                    border
                    border-slate-300
                    bg-white
                    px-4
                    py-2.5
                    text-sm
                    text-slate-900
                    placeholder-slate-400
                    outline-none
                    transition
                    focus:border-purple-500
                    dark:border-slate-700
                    dark:bg-slate-900
                    dark:text-white
                  "
                />

                <button
                  type="button"
                  onClick={confirmPaypalRefund}
                  disabled={processing || !paypalRefundTransactionId.trim()}
                  className="
                    flex
                    w-full
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    bg-purple-600
                    px-5
                    py-3
                    font-semibold
                    text-white
                    transition
                    hover:bg-purple-700
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                >
                  <CreditCard size={18} />
                  {processing
                    ? "Recording..."
                    : `Confirm $${paypalRefund.toFixed(2)} PayPal Refund`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* PARTIAL REFUND */}
      <div
        className="
          mt-6
          border-t
          border-amber-500/20
          pt-6
        "
      >
        <button
          type="button"
          onClick={() => setPartialRefundOpen(!partialRefundOpen)}
          disabled={processing}
          className="
            w-full
            rounded-xl
            border
            border-amber-500/30
            bg-amber-500/10
            px-5
            py-3
            font-semibold
            text-amber-500
            transition
            hover:bg-amber-500/20
            disabled:cursor-not-allowed
            disabled:opacity-40
          "
        >
          Issue Partial Refund
        </button>

        {partialRefundOpen && (
          <div
            className="
              mt-4
              rounded-xl
              border
              border-slate-200
              bg-white
              p-5
              dark:border-slate-800
              dark:bg-slate-950/40
            "
          >
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Offer Partial Refund
            </h3>

            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Offer a partial refund to the customer. The customer will choose
              whether to receive it in their ShipIN Wallet or through the
              original payment method.
            </p>

            {/* AMOUNT */}
            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Refund Amount ($)
              </label>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={partialRefundAmount}
                onChange={(e) => setPartialRefundAmount(e.target.value)}
                disabled={processing}
                placeholder="0.00"
                className="
                  mt-2
                  w-full
                  rounded-xl
                  border
                  border-slate-300
                  bg-white
                  px-4
                  py-3
                  text-sm
                  text-slate-900
                  outline-none
                  focus:border-amber-500
                  dark:border-slate-700
                  dark:bg-slate-900
                  dark:text-white
                "
              />
            </div>

            {/* REASON */}
            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Reason for Partial Refund
              </label>

              <textarea
                value={partialRefundReason}
                onChange={(e) => setPartialRefundReason(e.target.value)}
                disabled={processing}
                rows={3}
                placeholder="Why is this partial refund being offered?"
                className="
                  mt-2
                  w-full
                  resize-none
                  rounded-xl
                  border
                  border-slate-300
                  bg-white
                  px-4
                  py-3
                  text-sm
                  text-slate-900
                  outline-none
                  focus:border-amber-500
                  dark:border-slate-700
                  dark:bg-slate-900
                  dark:text-white
                "
              />
            </div>

            {/* ACTIONS */}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setPartialRefundOpen(false)}
                disabled={processing}
                className="
                  flex-1
                  rounded-xl
                  border
                  border-slate-300
                  px-4
                  py-3
                  text-sm
                  font-semibold
                  text-slate-700
                  dark:border-slate-700
                  dark:text-slate-300
                "
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handlePartialRefundOffer}
                disabled={processing}
                className="
                  flex-1
                  rounded-xl
                  bg-amber-600
                  px-4
                  py-3
                  text-sm
                  font-semibold
                  text-white
                  transition
                  hover:bg-amber-700
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
              >
                {processing
                  ? "Offering..."
                  : "Offer Partial Refund"}
              </button>
            </div>
          </div>
        )}
      </div>
      {/* COMPLETE REFUND */}
      <div
        className="
          mt-6
          border-t
          border-red-500/20
          pt-6
        "
      >
        <button
          type="button"
          onClick={completeRefund}
          disabled={
            processing ||
            (walletRefund > 0 && !walletCompleted) ||
            (paypalRefund > 0 && !paypalCompleted)
          }
          className="
            w-full
            rounded-xl
            bg-red-600
            px-5
            py-3
            font-semibold
            text-white
            transition
            hover:bg-red-700
            disabled:cursor-not-allowed
            disabled:opacity-40
          "
        >
          {processing ? "Processing..." : "Complete Refund"}
        </button>

        <p
          className="
            mt-2
            text-center
            text-xs
            text-slate-500
          "
        >
          This will mark the request as refunded after all required refund
          portions are completed.
        </p>
      </div>
    </div>
  );
}

/*
 * ========================================
 * REFUND DETAIL
 * ========================================
 */

function RefundDetail({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="
        rounded-xl
        border
        border-slate-200
        bg-white
        p-4
        dark:border-slate-800
        dark:bg-slate-950/40
      "
    >
      <p
        className="
          text-xs
          font-medium
          uppercase
          tracking-wide
          text-slate-500
          dark:text-slate-400
        "
      >
        {label}
      </p>

      <p
        className="
          mt-1
          break-all
          text-sm
          font-semibold
          text-slate-900
          dark:text-white
        "
      >
        {value}
      </p>
    </div>
  );
}







