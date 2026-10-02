"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { MessageCircle, MessageSquare, DollarSign, ChevronDown, ChevronUp } from "lucide-react";

import type { Request } from "@/types/request";
import useSupport from "@/hooks/useSupport";
import EmptyState from "@/components/ui/EmptyState";

interface Props {
  request: Request;
}

export default function SupportPanel({ request }: Props) {
  const {
    loading,
    tickets,
    selectedTicket,
    setSelectedTicket,
    messages,
    sendMessage,
    resolveTicket,
  } = useSupport(request.id, true);

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  
  const [partialRefundOpen, setPartialRefundOpen] = useState(false);
  const [partialRefundAmount, setPartialRefundAmount] = useState("");
  const [partialRefundReason, setPartialRefundReason] = useState("");
  const [partialRefundProcessing, setPartialRefundProcessing] = useState(false);
  const [partialRefundCompleting, setPartialRefundCompleting] = useState(false);
  const [partialRefundPaypalTransactionId, setPartialRefundPaypalTransactionId] = useState("");

  const [startingRefund, setStartingRefund] = useState(false);
  const [refundReason, setRefundReason] = useState("");

  /*
   * If tickets load but none is currently
   * selected, select the first one.
   */
  useEffect(() => {
    if (!selectedTicket && tickets.length > 0) {
      setSelectedTicket(tickets[0]);
    }
  }, [tickets, selectedTicket, setSelectedTicket]);

  async function handleSendMessage() {
    const trimmedMessage = message.trim();

    if (!selectedTicket || !trimmedMessage || sending) {
      return;
    }

    try {
      setSending(true);

      await sendMessage({
        ticketId: selectedTicket.id,
        sender: "admin",
        message: trimmedMessage,
      });

      setMessage("");
      toast.success("Reply sent.");
    } catch (error) {
      console.error("Unable to send support reply:", error);

      toast.error("Unable to send reply.", {
        description:
          error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSending(false);
    }
  }

  async function handleResolveTicket() {
    if (!selectedTicket || resolving) {
      return;
    }

    try {
      setResolving(true);

      await resolveTicket(selectedTicket.id);

      toast.success("Support ticket resolved.");
    } catch (error) {
      console.error("Unable to resolve support ticket:", error);

      toast.error("Unable to resolve support ticket.", {
        description:
          error instanceof Error ? error.message : undefined,
      });
    } finally {
      setResolving(false);
    }
  }

  async function handleAdminRefund() {
    if (
      startingRefund ||
      request.status !== "purchased"
    ) {
      return;
    }

    const reason = refundReason.trim();

    if (!reason) {
      toast.error("Please enter a reason for offering the refund.");
      return;
    }

    try {
      setStartingRefund(true);

      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("Authentication required.");
      }

      const idToken = await currentUser.getIdToken();

      const response = await fetch(
        `/api/admin/requests/${request.id}/refund-offer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            reason,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Unable to offer refund."
        );
      }

      toast.success(
        "Refund option offered to customer."
      );

      setRefundReason("");

      // Refresh the request so status becomes refund_offered.
      window.location.reload();

    } catch (error) {
      console.error(
        "Unable to offer refund:",
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to offer refund."
      );
    } finally {
      setStartingRefund(false);
    }
  }

  async function handlePartialRefund() {
    if (partialRefundProcessing) return;

    try {
      setPartialRefundProcessing(true);

      if (request.status === "rejected" || request.status === "refunded") {
        throw new Error("This request cannot be refunded.");
      }

      const amount = Number(partialRefundAmount);

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a valid refund amount.");
      }

      if (!partialRefundReason.trim()) {
        throw new Error("Enter a reason for the partial refund.");
      }

      const totalPaid = Number(
        request.payment?.amountPaid ??
          request.payment?.amount ??
          0
      );

      const alreadyRefunded = Number(
        request.totalRefundedAmount ?? 0
      );

      const remainingRefundable = Math.max(
        0,
        totalPaid - alreadyRefunded
      );

      if (amount > remainingRefundable) {
        throw new Error(
          `Maximum refundable amount is $${remainingRefundable.toFixed(2)}.`
        );
      }

      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("Authentication required.");
      }

      const idToken = await currentUser.getIdToken();

      const response = await fetch(
        `/api/admin/requests/${request.id}/partial-refund`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            amount,
            reason: partialRefundReason.trim(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Unable to offer partial refund."
        );
      }

      toast.success(
        `$${amount.toFixed(2)} partial refund offered to customer.`
      );

      setPartialRefundAmount("");
      setPartialRefundReason("");
      setPartialRefundOpen(false);

      window.location.reload();
    } catch (error) {
      console.error("Unable to offer partial refund:", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to offer partial refund."
      );
    } finally {
      setPartialRefundProcessing(false);
    }
  }

  async function handleCompletePartialRefund() {
    if (
      partialRefundCompleting ||
      request.partialRefundOffer?.status !== "accepted"
    ) {
      return;
    }

    try {
      setPartialRefundCompleting(true);

      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("Authentication required.");
      }

      const idToken = await currentUser.getIdToken();

      const offerAmount = Number(
        request.partialRefundOffer.amount ?? 0
      );

      const walletAmount = Number(
        request.payment?.walletAmount ?? 0
      );

      const paypalAmount = Math.max(
        0,
        Number((offerAmount - walletAmount).toFixed(2))
      );

      if (
        paypalAmount > 0 &&
        !partialRefundPaypalTransactionId.trim()
      ) {
        toast.error("PayPal refund transaction ID is required.");
        return;
      }

      const response = await fetch(
        `/api/admin/requests/${request.id}/partial-refund/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            paypalRefundTransactionId:
              partialRefundPaypalTransactionId.trim(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Unable to complete partial refund."
        );
      }

      toast.success(
        `$${offerAmount.toFixed(2)} partial refund completed.`
      );

      setPartialRefundPaypalTransactionId("");

      window.location.reload();
    } catch (error) {
      console.error(
        "Unable to complete partial refund:",
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to complete partial refund."
      );
    } finally {
      setPartialRefundCompleting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold text-white">Support</h2>
        <p className="mt-2 text-slate-400">Loading support tickets...</p>
      </div>
    );
  }

  const totalPaid = Number(
    request.payment?.amountPaid ?? request.payment?.amount ?? 0
  );
  const alreadyRefunded = Number(request.totalRefundedAmount ?? 0);
  const remainingRefundable = Math.max(0, totalPaid - alreadyRefunded);

  return (
    <div className="space-y-6">
      {/* ADMIN ACTION: REFUND CUSTOMER (FULL REFUND OFFER) */}
      {request.status === "purchased" && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 dark:bg-red-500/[0.04]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-500">
              Admin Action
            </p>

            <h2 className="mt-1 text-lg font-semibold text-white">
              Offer Full Refund to Customer
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Offer the customer the option to request a refund for this purchased order.
            </p>
          </div>

          <div className="mt-5">
            <label
              htmlFor="refund-reason"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Reason for refund offer
            </label>

            <textarea
              id="refund-reason"
              value={refundReason}
              onChange={(event) => setRefundReason(event.target.value)}
              placeholder="Enter the reason for offering this refund..."
              rows={4}
              disabled={startingRefund}
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            />

            <p className="mt-2 text-xs text-slate-500">
              This reason will be visible to the customer.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAdminRefund}
            disabled={startingRefund || !refundReason.trim()}
            className="mt-4 w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {startingRefund ? "Offering..." : "Offer Refund"}
          </button>
        </div>
      )}

      {/* ADMIN ACTION: PARTIAL REFUND ACCEPTED - ADMIN PROCESSING */}
      {request.partialRefundOffer?.status === "accepted" &&
        request.partialRefundOffer.selectedMethod ===
          "original_payment" && (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">
              Partial Refund
            </p>

            <h2 className="mt-1 text-lg font-semibold text-white">
              Refund Awaiting Processing
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              The customer accepted the partial refund using the
              original payment method.
            </p>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  Refund Amount
                </span>

                <span className="text-lg font-semibold text-white">
                  $
                  {Number(
                    request.partialRefundOffer.amount ?? 0
                  ).toFixed(2)}
                </span>
              </div>

              <div className="mt-3">
                <span className="text-sm text-slate-400">
                  Reason
                </span>

                <p className="mt-1 text-sm text-slate-200">
                  {request.partialRefundOffer.reason}
                </p>
              </div>
            </div>

            {(() => {
              const offerAmount = Number(
                request.partialRefundOffer?.amount ?? 0
              );

              const originalWalletAmount = Number(
                request.payment?.walletAmount ?? 0
              );

              const originalPaypalAmount = Number(
                request.payment?.paypalAmount ?? 0
              );

              const walletRefund = Math.min(
                offerAmount,
                Math.max(0, originalWalletAmount)
              );

              const paypalRefund = Math.max(
                0,
                Number(
                  (offerAmount - walletRefund).toFixed(2)
                )
              );

              return (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm">
                    <p className="text-slate-300">
                      Wallet portion:{" "}
                      <span className="font-semibold text-white">
                        ${walletRefund.toFixed(2)}
                      </span>
                    </p>

                    <p className="mt-1 text-slate-300">
                      PayPal portion:{" "}
                      <span className="font-semibold text-white">
                        ${paypalRefund.toFixed(2)}
                      </span>
                    </p>
                  </div>

                  {paypalRefund > 0 &&
                    originalPaypalAmount > 0 && (
                      <div>
                        <label
                          htmlFor="partial-refund-paypal-id"
                          className="mb-2 block text-sm font-medium text-slate-300"
                        >
                          PayPal Refund Transaction ID
                        </label>

                        <input
                          id="partial-refund-paypal-id"
                          type="text"
                          value={partialRefundPaypalTransactionId}
                          onChange={(e) =>
                            setPartialRefundPaypalTransactionId(
                              e.target.value
                            )
                          }
                          placeholder="Enter the PayPal refund transaction ID"
                          disabled={partialRefundCompleting}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                        />

                        <p className="mt-2 text-xs text-slate-500">
                          Complete the PayPal refund manually through
                          PayPal, then enter its transaction ID here.
                        </p>
                      </div>
                    )}

                  <button
                    type="button"
                    onClick={handleCompletePartialRefund}
                    disabled={
                      partialRefundCompleting ||
                      (paypalRefund > 0 &&
                        !partialRefundPaypalTransactionId.trim())
                    }
                    className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {partialRefundCompleting
                      ? "Completing Refund..."
                      : "Complete Partial Refund"}
                  </button>
                </div>
              );
            })()}
          </div>
        )}

      {/* ADMIN ACTION: PARTIAL REFUND UI */}
      {request.status !== "rejected" && request.status !== "refunded" && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 dark:bg-amber-500/[0.04]">
          <button
            type="button"
            onClick={() => setPartialRefundOpen((prev) => !prev)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">
                Admin Action
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Issue Partial Refund
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Offer a partial refund to the customer (Remaining refundable: ${remainingRefundable.toFixed(2)})
              </p>
            </div>
            {partialRefundOpen ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </button>

          {partialRefundOpen && (
            <div className="mt-5 space-y-4 border-t border-slate-800 pt-5">
              <div>
                <label
                  htmlFor="partial-refund-amount"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Refund Amount ($)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="partial-refund-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={remainingRefundable}
                    value={partialRefundAmount}
                    onChange={(e) => setPartialRefundAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={partialRefundProcessing}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-9 pr-4 text-sm text-white outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="partial-refund-reason"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Reason for Partial Refund
                </label>
                <textarea
                  id="partial-refund-reason"
                  value={partialRefundReason}
                  onChange={(e) => setPartialRefundReason(e.target.value)}
                  placeholder="Explain why this partial refund is being issued..."
                  rows={3}
                  disabled={partialRefundProcessing}
                  className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <button
                type="button"
                onClick={handlePartialRefund}
                disabled={
                  partialRefundProcessing ||
                  !partialRefundAmount ||
                  !partialRefundReason.trim()
                }
                className="w-full rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {partialRefundProcessing ? "Processing..." : "Offer Partial Refund"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* HEADER */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold text-white">Support</h2>
        <p className="mt-2 text-slate-400">
          Support tickets for request #{request.id.slice(0, 6)}
        </p>
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={26} />}
          title="No support tickets"
          description="There are no support tickets associated with this request yet."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* TICKET LIST */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-4">
              <h3 className="font-semibold text-white">Tickets</h3>
              <p className="mt-1 text-xs text-slate-500">
                {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="space-y-2">
              {tickets.map((ticket: any) => {
                const active = selectedTicket?.id === ticket.id;

                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedTicket(ticket)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-violet-500 bg-violet-500/10"
                        : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {ticket.subject || "Support Ticket"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          #{ticket.ticketNumber || ticket.id.slice(0, 8)}
                        </p>
                      </div>

                      {ticket.adminUnread && (
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" />
                      )}
                    </div>

                    <div className="mt-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          ticket.status === "resolved"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {ticket.status === "resolved" ? "Resolved" : "Open"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CONVERSATION */}
          {selectedTicket && (
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              {/* CONVERSATION HEADER */}
              <div className="flex flex-col gap-4 border-b border-slate-800 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-white">
                    {(selectedTicket as any).subject || "Support Ticket"}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Ticket #
                    {(selectedTicket as any).ticketNumber ||
                      selectedTicket.id.slice(0, 8)}
                  </p>
                </div>

                {(selectedTicket as any).status !== "resolved" && (
                  <button
                    type="button"
                    onClick={handleResolveTicket}
                    disabled={resolving}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resolving ? "Resolving..." : "Resolve Ticket"}
                  </button>
                )}
              </div>

              {/* MESSAGES */}
              <div className="max-h-[560px] min-h-[400px] space-y-4 overflow-y-auto p-5">
                {messages.length === 0 ? (
                  <EmptyState
                    icon={<MessageSquare size={26} />}
                    title="No messages yet"
                    description="Messages from the customer will appear here when the conversation begins."
                  />
                ) : (
                  messages.map((supportMessage: any) => {
                    const fromAdmin = supportMessage.sender === "admin";

                    return (
                      <div
                        key={supportMessage.id}
                        className={`flex ${
                          fromAdmin ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                            fromAdmin
                              ? "bg-violet-600 text-white"
                              : "border border-slate-700 bg-slate-800 text-slate-200"
                          }`}
                        >
                          <p className="mb-1 text-xs font-medium opacity-70">
                            {fromAdmin ? "ShipIN Support" : "Customer"}
                          </p>
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {supportMessage.message}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* REPLY */}
              {(selectedTicket as any).status === "resolved" ? (
                <div className="border-t border-slate-800 p-5">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center text-sm text-emerald-400">
                    This support ticket has been resolved.
                  </div>
                </div>
              ) : (
                <div className="border-t border-slate-800 p-5">
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    placeholder="Reply to the customer..."
                    rows={4}
                    className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-500"
                  />

                  <div className="mt-3 flex items-center justify-between gap-4">
                    <p className="text-xs text-slate-500">
                      Enter to send · Shift + Enter for a new line
                    </p>

                    <button
                      type="button"
                      onClick={handleSendMessage}
                      disabled={sending || !message.trim()}
                      className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending ? "Sending..." : "Send Reply"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}