"use client";

import { useState } from "react";
import type { Request } from "@/types/request";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";

import Section from "@/components/ui/Section";
import InfoCard from "@/components/ui/InfoCard";
import StatusBadge from "@/components/ui/StatusBadge";
import NextActionCard from "@/components/admin/request/NextActionCard";
import RefundActionCard from "@/components/admin/request/RefundActionCard";
import Stepper from "@/components/ui/Stepper";
import Modal from "@/components/ui/Modal";

interface Props {
  request: Request;
  onGoToQuote?: () => void;
}

export default function OverviewPanel({ request, onGoToQuote }: Props) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  async function handleReject() {
    const reason = rejectionReason.trim();

    if (!reason) {
      toast.error("Please enter a reason for rejecting this request.");
      return;
    }

    if (
      request.status !== "submitted" &&
      request.status !== "review"
    ) {
      toast.error("This request can no longer be rejected.");
      return;
    }

    try {
      setRejecting(true);

      const requestRef = doc(db, "requests", request.id);

      await updateDoc(requestRef, {
        status: "rejected",
        rejectionReason: reason,
        rejectedAt: serverTimestamp(),
        [`statusHistory.rejected`]: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success("Request rejected successfully.");
      setRejectOpen(false);
      setRejectionReason("");
    } catch (error) {
      console.error("Failed to reject request:", error);
      toast.error("Unable to reject the request.");
    } finally {
      setRejecting(false);
    }
  }

  /*
   * ========================================
   * PAYMENT STATUS
   * ========================================
   */

  const payment = request.payment as
    | {
        paymentMethod?: string;
        provider?: string;
        amount?: number;
        amountPaid?: number;
        walletAmount?: number;
        paypalAmount?: number;
        currency?: string;
        orderId?: string;
        captureId?: string;
        status?: string;
        paidAt?: any;
      }
    | undefined;

  const paymentCompleted =
    request.status === "paid" ||
    request.status === "purchased" ||
    request.status === "warehouse_received" ||
    request.status === "packed" ||
    request.status === "shipped" ||
    request.status === "out_for_delivery" ||
    request.status === "delivered";

  const walletAmount = Number(payment?.walletAmount ?? 0);
  const paypalAmount = Number(payment?.paypalAmount ?? 0);
  const totalPaid = Number(payment?.amountPaid ?? payment?.amount ?? 0);

  /*
   * Older payment records may not have paymentMethod yet.
   * Fall back to the old provider field.
   */
  let paymentMethod = payment?.paymentMethod || payment?.provider || "";

  if (paymentMethod === "paypal_and_wallet") {
    paymentMethod = "wallet_and_paypal";
  }

  /*
   * If old records have wallet + PayPal amounts but no method,
   * determine it automatically.
   */
  if (!payment?.paymentMethod) {
    if (walletAmount > 0 && paypalAmount > 0) {
      paymentMethod = "wallet_and_paypal";
    } else if (walletAmount > 0) {
      paymentMethod = "wallet";
    } else if (paypalAmount > 0) {
      paymentMethod = "paypal";
    }
  }

  let paymentMethodLabel = "Not recorded";

  if (paymentMethod === "paypal") {
    paymentMethodLabel = "PayPal";
  }
  if (paymentMethod === "wallet") {
    paymentMethodLabel = "Wallet";
  }
  if (paymentMethod === "wallet_and_paypal") {
    paymentMethodLabel = "Wallet + PayPal";
  }

  /*
   * ========================================
   * PAYMENT DETAILS SUBCOMPONENT
   * ========================================
   */
  function PaymentDetails() {
    if (!paymentCompleted && !payment) {
      return (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Payment Status
              </p>
              <p className="mt-1 text-lg font-semibold text-amber-400">
                Pending
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            No completed payment has been recorded for this request.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-6">
        {/* HEADER */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Payment Status
            </p>
            <p className="mt-1 text-xl font-bold text-green-600 dark:text-green-400">
              Payment Completed
            </p>
          </div>
          <div className="rounded-full bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-600 dark:text-green-400">
            Paid
          </div>
        </div>

        {/* PAYMENT METHOD */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PaymentDetail
            label="Payment Method"
            value={paymentMethodLabel}
          />
          <PaymentDetail
            label="Total Paid"
            value={totalPaid > 0 ? `$${totalPaid.toFixed(2)}` : "—"}
          />
          <PaymentDetail
            label="Currency"
            value={payment?.currency || "USD"}
          />
        </div>

        {/* PAYMENT BREAKDOWN */}
        {(walletAmount > 0 || paypalAmount > 0) && (
          <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
            <p className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
              Payment Breakdown
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {walletAmount > 0 && (
                <PaymentDetail
                  label="Wallet Used"
                  value={`$${walletAmount.toFixed(2)}`}
                  valueClassName="text-blue-600 dark:text-blue-400"
                />
              )}
              {paypalAmount > 0 && (
                <PaymentDetail
                  label="PayPal Paid"
                  value={`$${paypalAmount.toFixed(2)}`}
                  valueClassName="text-purple-600 dark:text-purple-400"
                />
              )}
            </div>
          </div>
        )}

        {/* TRANSACTION DETAILS */}
        {(payment?.orderId || payment?.captureId) && (
          <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
            <p className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
              Transaction Details
            </p>
            <div className="space-y-3">
              {payment.orderId && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm text-slate-500">
                    PayPal Order ID
                  </span>
                  <span className="break-all font-mono text-xs text-slate-700 dark:text-slate-300 sm:text-right">
                    {payment.orderId}
                  </span>
                </div>
              )}
              {payment.captureId && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm text-slate-500">
                    Capture ID
                  </span>
                  <span className="break-all font-mono text-xs text-slate-700 dark:text-slate-300 sm:text-right">
                    {payment.captureId}
                  </span>
                </div>
              )}
              {payment.status && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">
                    Transaction Status
                  </span>
                  <span className="font-semibold capitalize text-green-600 dark:text-green-400">
                    {payment.status}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* OVERVIEW */}
      <Section
        title="Request Overview"
        subtitle="Summary of this purchase request"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <InfoCard
            title="Status"
            value={<StatusBadge status={request.status} />}
          />
          <InfoCard
            title="Products"
            value={`${request.items?.length ?? 0} Items`}
          />
          <InfoCard
            title="Quote"
            value={
              typeof request.quote?.breakdown?.grandTotal === "number"
                ? `$${request.quote.breakdown.grandTotal.toFixed(2)}`
                : "Pending"
            }
          />
          <InfoCard
            title="Shipment"
            value={request.tracking?.carrier ?? "Not Created"}
          />
          <InfoCard
            title="Payment"
            value={
              paymentCompleted
                ? paymentMethodLabel === "Not recorded"
                  ? "Completed"
                  : paymentMethodLabel
                : "Pending"
            }
          />
        </div>
      </Section>

      {/* REFUND ACTION — TOP PRIORITY */}
      <RefundActionCard request={request} />

      {/* PAYMENT DETAILS */}
      <Section
        title="Payment Details"
        subtitle="Payment method and transaction information"
      >
        <PaymentDetails />
      </Section>

      {/* CUSTOMER SELECTED SERVICES */}
      <Section
        title="Customer Preferences"
        subtitle="Selections made during request creation"
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <InfoCard
            title="Inspection"
            value={
              request.serviceSelections?.inspection === "none"
                ? "No Inspection"
                : request.serviceSelections?.inspection === "standard"
                ? "Standard Inspection"
                : "Detailed Inspection"
            }
          />
          <InfoCard
            title="Shipping Preference"
            value={
              request.serviceSelections?.shippingPreference === "auto"
                ? "Auto Ship"
                : request.serviceSelections?.shippingPreference === "approval"
                ? "Wait For Approval"
                : "Hold Package"
            }
          />
        </div>
      </Section>

      {/* REJECTION INFORMATION */}
      {request.status === "rejected" && request.rejectionReason && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h2 className="text-xl font-semibold text-red-700 dark:text-red-300">
            Request Rejected
          </h2>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            This request has been rejected.
          </p>
          <div className="mt-4 rounded-xl border border-red-500/20 bg-white/60 p-4 dark:bg-slate-950/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-500 dark:text-red-400">
              Rejection Reason
            </p>
            <p className="mt-2 text-slate-700 dark:text-slate-200">
              {request.rejectionReason}
            </p>
          </div>
        </div>
      )}

      {/* QUOTE REGENERATION */}
      {request.quoteRegenerationRequested && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-500/20 dark:bg-amber-500/10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-amber-700 dark:text-amber-300">
                🔄 New Quote Requested
              </h2>
              <p className="mt-2 text-slate-600 dark:text-slate-300">
                The customer requested a refreshed quotation because the
                previous quote expired.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToQuote}
              className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Generate New Quote
            </button>
          </div>
        </div>
      )}

      {/* ADMIN ACTIONS */}
      <Section
        title="Admin Actions"
        subtitle="Manage the current request workflow"
      >
        <div className="space-y-4">
          {/* NORMAL WORKFLOW ACTION */}

          {request.status !== "rejected" && (
            <NextActionCard
              requestId={request.id}
              status={request.status}
            />
          )}

          {(request.status === "submitted" || request.status === "review") && (
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3 font-semibold text-red-600 transition hover:bg-red-500/20 dark:text-red-400"
            >
              Reject Request
            </button>
          )}

          {request.status === "rejected" && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-center text-sm font-medium text-red-600 dark:text-red-400">
              This request has already been rejected.
            </div>
          )}
        </div>
      </Section>

      {/* WORKFLOW */}
      <Section title="Workflow">
        <Stepper currentStatus={request.status} />
      </Section>

      {/* REJECT MODAL */}
      <Modal
        open={rejectOpen}
        title="Reject Request"
        onClose={() => {
          if (!rejecting) {
            setRejectOpen(false);
          }
        }}
      >
        <div className="space-y-5">
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Please provide a reason for rejecting this request. The customer
              will be able to see this reason.
            </p>
          </div>

          <div>
            <label
              htmlFor="rejection-reason"
              className="mb-2 block text-sm font-semibold text-slate-900 dark:text-white"
            >
              Rejection Reason
            </label>

            <textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              disabled={rejecting}
              rows={5}
              maxLength={1000}
              placeholder="Explain why this request cannot be processed..."
              className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
            />

            <div className="mt-2 text-right text-xs text-slate-400">
              {rejectionReason.length}/1000
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                if (!rejecting) {
                  setRejectOpen(false);
                  setRejectionReason("");
                }
              }}
              disabled={rejecting}
              className="rounded-xl border border-slate-300 px-5 py-2.5 font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleReject}
              disabled={rejecting || !rejectionReason.trim()}
              className="rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {rejecting ? "Rejecting..." : "Reject Request"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/*
 * ========================================
 * PAYMENT DETAIL HELPER
 * ========================================
 */
function PaymentDetail({
  label,
  value,
  valueClassName = "text-slate-900 dark:text-white",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-1 break-all text-sm font-semibold ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}