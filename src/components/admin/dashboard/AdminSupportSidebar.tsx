"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageCircle,
  Send,
  CheckCircle2,
  ExternalLink,
  DollarSign,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

import {
  subscribeToAllSupportTickets,
  subscribeToSupportMessages,
  subscribeToRequest,
  markSupportTicketRead,
  resolveSupportTicket,
} from "@/lib/firestore";

interface SupportTicket {
  id: string;
  requestId: string;
  customerId: string;
  category?: string;
  subject?: string;
  status?: string;
  customerUnread?: boolean;
  adminUnread?: boolean;
  updatedAt?: any;
  createdAt?: any;
}

interface SupportMessage {
  id: string;
  ticketId: string;
  sender: "customer" | "admin";
  message: string;
  createdAt?: any;
}

interface RequestData {
  id: string;
  status?: string;
  payment?: {
    amount?: number;
    amountPaid?: number;
    walletAmount?: number;
    paypalAmount?: number;
    currency?: string;
  };
  totalRefundedAmount?: number;
  refundOffer?: {
    offered?: boolean;
    reason?: string;
    amount?: number;
  };
  refundRequest?: {
    status?: string;
    preference?: string;
    initiatedBy?: string;
    amount?: number;
    requestedAt?: any;
  };
}

export default function AdminSupportSidebar() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(
    null
  );

  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [requests, setRequests] = useState<Record<string, RequestData>>({});

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [partialRefundOpen, setPartialRefundOpen] = useState(false);
  const [partialRefundAmount, setPartialRefundAmount] = useState("");
  const [partialRefundReason, setPartialRefundReason] = useState("");
  const [partialRefundProcessing, setPartialRefundProcessing] =
    useState(false);

  /*
   * ========================================
   * ALL SUPPORT TICKETS
   * ========================================
   */

  useEffect(() => {
    const unsubscribe = subscribeToAllSupportTickets((data) => {
      setTickets(data);

      setSelectedTicket((current) => {
        if (!current && data.length > 0) {
          return data[0];
        }

        if (!current) {
          return null;
        }

        return (
          data.find((ticket) => ticket.id === current.id) || null
        );
      });

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  /*
   * ========================================
   * SELECTED TICKET MESSAGES
   * ========================================
   */

  useEffect(() => {
    if (!selectedTicket) {
      setMessages([]);
      return;
    }

    markSupportTicketRead(selectedTicket.id, "admin");

    const unsubscribe = subscribeToSupportMessages(
      selectedTicket.id,
      setMessages
    );

    return unsubscribe;
  }, [selectedTicket]);

  /*
   * ========================================
   * LOAD ASSOCIATED REQUEST (REALTIME)
   * ========================================
   */

  useEffect(() => {
    if (!selectedTicket?.requestId) {
      return;
    }

    const unsubscribe = subscribeToRequest(
      selectedTicket.requestId,
      (request) => {
        if (!request) {
          return;
        }

        setRequests((current) => ({
          ...current,
          [request.id]: request,
        }));
      }
    );

    return unsubscribe;
  }, [selectedTicket]);

  const selectedRequest = selectedTicket?.requestId
    ? requests[selectedTicket.requestId]
    : null;

  /*
   * ========================================
   * SEND MESSAGE
   * ========================================
   */

  async function handleSendMessage() {
    const trimmed = message.trim();

    if (!selectedTicket || !trimmed || sending) {
      return;
    }

    try {
      setSending(true);

      const response = await fetch(
        `/api/support/${selectedTicket.id}/message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: "admin",
            message: trimmed,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Unable to send support reply."
        );
      }

      setMessage("");
      toast.success("Reply sent.");
    } catch (error) {
      console.error("Unable to send support reply:", error);

      toast.error(
        error instanceof Error ? error.message : "Unable to send reply."
      );
    } finally {
      setSending(false);
    }
  }

  /*
   * ========================================
   * RESOLVE TICKET
   * ========================================
   */

  async function handleResolve() {
    if (!selectedTicket || resolving) {
      return;
    }

    try {
      setResolving(true);
      await resolveSupportTicket(selectedTicket.id);
      toast.success("Support ticket resolved.");
    } catch (error) {
      console.error("Unable to resolve ticket:", error);
      toast.error("Unable to resolve support ticket.");
    } finally {
      setResolving(false);
    }
  }

  const refundStatus = selectedRequest?.refundRequest?.status;

  const refundStatusConfig =
    refundStatus === "completed"
      ? {
          label: "Refund Completed",
          className: "bg-emerald-500/10 text-emerald-300",
        }
      : refundStatus === "processing"
      ? {
          label: "Refund Processing",
          className: "bg-blue-500/10 text-blue-300",
        }
      : refundStatus === "requested"
      ? {
          label: "Refund Requested",
          className: "bg-amber-500/10 text-amber-300",
        }
      : {
          label: "Refund Offered",
          className: "bg-purple-500/10 text-purple-300",
        };

  /*
   * ========================================
   * PARTIAL REFUND HANDLER
   * ========================================
   */

  async function handlePartialRefund() {
    if (
      partialRefundProcessing ||
      !selectedRequest
    ) {
      return;
    }

    const amount =
      Number(partialRefundAmount);

    const reason =
      partialRefundReason.trim();

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      toast.error(
        "Enter a valid refund amount."
      );
      return;
    }

    if (!reason) {
      toast.error(
        "A refund reason is required."
      );
      return;
    }

    try {
      setPartialRefundProcessing(true);

      const response =
        await fetch(
          `/api/admin/requests/${selectedRequest.id}/partial-refund`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              amount,
              reason,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to offer partial refund."
        );
      }

      toast.success(
        `$${amount.toFixed(
          2
        )} partial refund offered to the customer.`
      );

      setPartialRefundAmount("");
      setPartialRefundReason("");
      setPartialRefundOpen(false);

      /*
       * Refresh the selected request so the
       * newly-created offer is reflected in
       * the sidebar.
       */
    } catch (error) {
      console.error(
        "Admin support partial refund offer error:",
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to offer partial refund."
      );
    } finally {
      setPartialRefundProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-semibold text-white">Support</h2>
        <p className="mt-2 text-sm text-slate-400">
          Loading support tickets...
        </p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="grid min-h-[650px] grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* SIDEBAR */}
        <aside className="border-b border-slate-800 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-800 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Support</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {tickets.length} conversation
                  {tickets.length === 1 ? "" : "s"}
                </p>
              </div>

              {tickets.some((ticket) => ticket.adminUnread) && (
                <span className="rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white">
                  New
                </span>
              )}
            </div>
          </div>

          <div className="max-h-[590px] overflow-y-auto p-3">
            {tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                <MessageCircle size={30} className="text-slate-600" />
                <p className="mt-4 font-medium text-slate-300">
                  No support conversations
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Customer support tickets will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tickets.map((ticket) => {
                  const selected = selectedTicket?.id === ticket.id;

                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => setSelectedTicket(ticket)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selected
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-violet-400">
                            Request #
                            {ticket.requestId?.slice(0, 6).toUpperCase()}
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-white">
                            {ticket.subject || "Support Request"}
                          </p>
                          <p className="mt-1 text-xs capitalize text-slate-500">
                            {ticket.category || "Support"}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {ticket.status === "resolved" && (
                            <CheckCircle2
                              size={15}
                              className="text-green-400"
                            />
                          )}
                          {ticket.adminUnread && (
                            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* CONVERSATION */}
        <div className="flex min-w-0 flex-col">
          {!selectedTicket ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <MessageCircle
                  size={40}
                  className="mx-auto text-slate-700"
                />
                <p className="mt-4 font-semibold text-slate-300">
                  Select a conversation
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Choose a support request from the sidebar.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* HEADER */}
              <div className="border-b border-slate-800 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-violet-400">
                      Request #
                      {selectedTicket.requestId?.slice(0, 6).toUpperCase()}
                    </p>

                    <h3 className="mt-1 truncate text-lg font-semibold text-white">
                      {selectedTicket.subject || "Support Request"}
                    </h3>

                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {selectedTicket.category || "Support"} ·{" "}
                      {selectedTicket.status}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/admin/requests/${selectedTicket.requestId}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
                    >
                      <ExternalLink size={14} />
                      Request
                    </Link>

                    {selectedTicket.status !== "resolved" && (
                      <button
                        type="button"
                        onClick={handleResolve}
                        disabled={resolving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} />
                        {resolving ? "Resolving..." : "Resolve"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* EXISTING REFUND DETAILS */}
              {selectedRequest?.refundOffer?.offered && (
                <div className="border-b border-amber-500/20 bg-amber-500/5 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-400">
                        Refund Offer
                      </p>

                      {selectedRequest.refundOffer.reason && (
                        <p className="mt-2 text-sm text-amber-200">
                          {selectedRequest.refundOffer.reason}
                        </p>
                      )}

                      {typeof selectedRequest.refundOffer.amount ===
                        "number" && (
                        <p className="mt-2 text-sm font-semibold text-amber-300">
                          ${selectedRequest.refundOffer.amount.toFixed(2)}
                        </p>
                      )}
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${refundStatusConfig.className}`}
                    >
                      {refundStatusConfig.label}
                    </span>
                  </div>

                  {selectedRequest.refundRequest && (
                    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Customer Selection
                      </p>

                      <p className="mt-1 text-sm font-medium text-white">
                        {selectedRequest.refundRequest.preference === "wallet"
                          ? "Wallet Credit"
                          : selectedRequest.refundRequest.preference ===
                            "original_payment"
                          ? "Original Payment Method"
                          : selectedRequest.refundRequest.preference}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Status:{" "}
                        {refundStatus === "completed"
                          ? "Completed"
                          : refundStatus === "processing"
                          ? "Processing"
                          : refundStatus === "requested"
                          ? "Requested"
                          : "Offered"}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* PARTIAL REFUND CONTROLS */}
              {selectedRequest && (
                <div className="border-b border-slate-800 bg-slate-950/30 p-4">
                  <button
                    type="button"
                    onClick={() => setPartialRefundOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-violet-400 transition hover:text-violet-300"
                  >
                    <span className="flex items-center gap-1.5">
                      <DollarSign size={14} /> Issue Partial Refund
                    </span>
                    {partialRefundOpen ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </button>

                  {partialRefundOpen && (
                    <div className="mt-4 space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400">
                          Amount ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={partialRefundAmount}
                          onChange={(e) =>
                            setPartialRefundAmount(e.target.value)
                          }
                          placeholder="0.00"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400">
                          Reason
                        </label>
                        <textarea
                          rows={2}
                          value={partialRefundReason}
                          onChange={(e) =>
                            setPartialRefundReason(e.target.value)
                          }
                          placeholder="State the reason for this partial refund..."
                          className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setPartialRefundOpen(false)}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handlePartialRefund}
                          disabled={partialRefundProcessing}
                          className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                        >
                          {partialRefundProcessing
                            ? "Processing..."
                            : "Issue Refund"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MESSAGES */}
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                {messages.length === 0 ? (
                  <p className="text-center text-sm text-slate-500">
                    No messages yet.
                  </p>
                ) : (
                  messages.map((item) => {
                    const fromAdmin = item.sender === "admin";

                    return (
                      <div
                        key={item.id}
                        className={`flex ${
                          fromAdmin ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                            fromAdmin
                              ? "bg-violet-600 text-white"
                              : "bg-slate-800 text-white"
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-sm">
                            {item.message}
                          </p>

                          <p
                            className={`mt-1 text-[11px] ${
                              fromAdmin
                                ? "text-violet-100"
                                : "text-slate-500"
                            }`}
                          >
                            {fromAdmin ? "You" : "Customer"}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* REPLY */}
              {selectedTicket.status === "resolved" ? (
                <div className="border-t border-slate-800 p-5 text-center">
                  <p className="text-sm font-medium text-slate-500">
                    This support conversation has been resolved.
                  </p>
                </div>
              ) : (
                <div className="border-t border-slate-800 p-4">
                  <div className="flex gap-3">
                    <textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey
                        ) {
                          event.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Reply to customer..."
                      rows={2}
                      className="min-h-[52px] flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-500"
                    />

                    <button
                      type="button"
                      onClick={handleSendMessage}
                      disabled={sending || !message.trim()}
                      className="self-end rounded-xl bg-violet-600 p-3 text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send size={18} />
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-slate-600">
                    Press Enter to send · Shift + Enter for a new line
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}