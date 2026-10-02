"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

import useCustomerSupport from "@/hooks/useCustomerSupport";

interface Props {
  customerId: string;
}

export default function CustomerSupportCenter({ customerId }: Props) {
  const {
    loading,
    tickets,
    requests,
    selectedTicket,
    selectedRequest,
    setSelectedTicket,
    selectRefundRequest,
    createTicket,
    openCreatedTicket,
    messages,
    refundOffer,
    sendMessage,
  } = useCustomerSupport(customerId);

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [refundPreference, setRefundPreference] = useState<"wallet" | "original_payment">("wallet");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [ticketCreating, setTicketCreating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!selectedTicket || !message.trim() || sending) {
      return;
    }

    try {
      setSending(true);
      await sendMessage(selectedTicket.id, message);
      setMessage("");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Unable to send message."
      );
    } finally {
      setSending(false);
    }
  }

  async function handleRefundRequest() {
    const requestId = selectedTicket?.requestId || selectedRequest?.id;

    if (!requestId || refundSubmitting) {
      return;
    }

    try {
      setRefundSubmitting(true);

      const response = await fetch(`/api/requests/${requestId}/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preference: refundPreference,
          initiatedBy: "customer",
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Unable to submit refund request."
        );
      }

      toast.success("Refund request submitted successfully.");
    } catch (error) {
      console.error("Unable to submit refund request:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to submit refund request."
      );
    } finally {
      setRefundSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-slate-500">Loading support...</p>
      </div>
    );
  }

  return (
    <div className="grid min-h-[600px] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-12">
      {/* SIDEBAR */}
      <aside className="border-b border-slate-200 dark:border-slate-800 lg:col-span-4 lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-200 p-5 dark:border-slate-800">
          <h2 className="text-xl font-bold text-slate-950 dark:text-white">
            Support
          </h2>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your request conversations
          </p>
        </div>

        <div className="max-h-[520px] overflow-y-auto p-3">
          {tickets.length === 0 &&
          !requests.some(
            (request) =>
              request.status === "refund_offered" &&
              request.refundOffer?.offered === true
          ) ? (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
              <MessageCircle
                size={32}
                className="text-slate-400"
              />

              <p className="mt-4 font-semibold text-slate-700 dark:text-slate-300">
                No support conversations
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Your support conversations will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* EXISTING SUPPORT TICKETS */}
              {tickets.map((ticket) => {
                const selected = selectedTicket?.id === ticket.id;

                return (
                  <button
                    key={`ticket-${ticket.id}`}
                    type="button"
                    onClick={() => setSelectedTicket(ticket)}
                    className={`w-full rounded-xl p-4 text-left transition ${
                      selected
                        ? "bg-purple-600 text-white"
                        : "bg-slate-50 text-slate-900 hover:bg-slate-100 dark:bg-slate-950/50 dark:text-white dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={`text-xs font-bold uppercase tracking-wide ${
                            selected
                              ? "text-purple-100"
                              : "text-purple-600 dark:text-purple-400"
                          }`}
                        >
                          Request #
                          {ticket.requestId
                            .slice(0, 6)
                            .toUpperCase()}
                        </p>

                        <p className="mt-1 truncate font-semibold">
                          {ticket.subject || "Support Request"}
                        </p>

                        <p
                          className={`mt-1 text-xs ${
                            selected
                              ? "text-purple-100"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {ticket.category}
                        </p>
                      </div>

                      {ticket.status === "resolved" && (
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            selected
                              ? "bg-purple-500/30 text-purple-100"
                              : "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                          }`}
                        >
                          Resolved
                        </span>
                      )}

                      {ticket.customerUnread && (
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-purple-500" />
                      )}
                    </div>
                  </button>
                );
              })}

              {/* REFUND-OFFERED REQUESTS */}
              {requests
                .filter(
                  (request) =>
                    request.status === "refund_offered" &&
                    request.refundOffer?.offered === true &&
                    !tickets.some(
                      (ticket) => ticket.requestId === request.id
                    )
                )
                .map((request) => {
                  const selected = selectedRequest?.id === request.id;

                  return (
                    <button
                      key={`refund-${request.id}`}
                      type="button"
                      onClick={() => selectRefundRequest(request)}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        selected
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-amber-200 bg-amber-50 text-slate-900 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-white dark:hover:bg-amber-500/10"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={`text-xs font-bold uppercase tracking-wide ${
                              selected
                                ? "text-amber-100"
                                : "text-amber-700 dark:text-amber-400"
                            }`}
                          >
                            Request #
                            {request.id.slice(0, 6).toUpperCase()}
                          </p>

                          <p className="mt-1 font-semibold">
                            Refund Offered
                          </p>

                          <p
                            className={`mt-1 text-xs ${
                              selected
                                ? "text-amber-100"
                                : "text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            Refund amount{" "}
                            {typeof request.refundOffer?.amount === "number"
                              ? `$${request.refundOffer.amount.toFixed(2)}`
                              : "available"}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            selected
                              ? "bg-white/20 text-white"
                              : "bg-amber-200 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
                          }`}
                        >
                          Action Required
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </aside>

      {/* CONVERSATION VIEW */}
      <section className="flex min-h-[600px] flex-col lg:col-span-8">
        {!selectedTicket && !selectedRequest ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <MessageCircle
                size={40}
                className="mx-auto text-slate-300 dark:text-slate-700"
              />

              <p className="mt-4 font-semibold text-slate-700 dark:text-slate-300">
                Select a request
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Choose a request from the sidebar to view its conversation.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            {selectedTicket && (
              <div className="border-b border-slate-200 p-5 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400">
                  Request #
                  {selectedTicket.requestId.slice(0, 6).toUpperCase()}
                </p>

                <div className="mt-1 flex items-center justify-between gap-4">
                  <h3 className="text-lg font-bold text-slate-950 dark:text-white">
                    {selectedTicket.subject || "Support Request"}
                  </h3>

                  <span className="text-xs font-medium capitalize text-slate-500">
                    {selectedTicket.status}
                  </span>
                </div>
              </div>
            )}

            {/* Active Refund Offer Banner */}
            {refundOffer && !selectedRequest?.refundRequest && (
              <div className="border-b border-amber-200 bg-amber-50 p-5 dark:border-amber-500/20 dark:bg-amber-500/5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                    <span className="text-sm font-bold">$</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="font-semibold text-amber-900 dark:text-amber-300">
                          Refund Offered
                        </h4>

                        {refundOffer.reason && (
                          <div className="mt-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                              Reason
                            </p>

                            <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                              {refundOffer.reason}
                            </p>
                          </div>
                        )}

                        {typeof refundOffer.amount === "number" && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                              Refund Amount
                            </p>

                            <p className="mt-1 text-lg font-bold text-amber-900 dark:text-amber-200">
                              ${refundOffer.amount.toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>

                      <Link
                        href={`/requests/${
                          selectedTicket?.requestId || selectedRequest?.id
                        }`}
                        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
                      >
                        Go to Request
                      </Link>
                    </div>

                    {/* Preference Selection */}
                    <div className="mt-5 rounded-xl border border-amber-200 bg-white p-4 dark:border-amber-500/20 dark:bg-slate-900">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Choose Refund Method
                      </p>

                      <div className="mt-3 space-y-3">
                        <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                          <input
                            type="radio"
                            name="support-refund-preference"
                            value="wallet"
                            checked={refundPreference === "wallet"}
                            onChange={() => setRefundPreference("wallet")}
                            disabled={refundSubmitting}
                          />

                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">
                              Wallet Credit
                            </p>

                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Instantly credit the refund to your ShipIN wallet.
                            </p>
                          </div>
                        </label>

                        <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                          <input
                            type="radio"
                            name="support-refund-preference"
                            value="original_payment"
                            checked={refundPreference === "original_payment"}
                            onChange={() => setRefundPreference("original_payment")}
                            disabled={refundSubmitting}
                          />

                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">
                              Original Payment Method
                            </p>

                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Refund the amount through the original payment method.
                            </p>
                          </div>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={handleRefundRequest}
                        disabled={refundSubmitting}
                        className="mt-4 w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {refundSubmitting ? "Submitting..." : "Request Refund"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Refund Banner: Pending vs Completed */}
            {selectedRequest?.refundRequest && (
              <div
                className={`border-b p-5 ${
                  selectedRequest.refundRequest.status === "completed"
                    ? "border-green-200 bg-green-50 dark:border-green-500/20 dark:bg-green-500/5"
                    : "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      selectedRequest.refundRequest.status === "completed"
                        ? "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                    }`}
                  >
                    <span className="text-sm font-bold">$</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4
                          className={`font-semibold ${
                            selectedRequest.refundRequest.status === "completed"
                              ? "text-green-900 dark:text-green-300"
                              : "text-amber-900 dark:text-amber-300"
                          }`}
                        >
                          {selectedRequest.refundRequest.status === "completed"
                            ? "Refund Completed"
                            : "Refund Request Pending"}
                        </h4>

                        <p
                          className={`mt-1 text-sm ${
                            selectedRequest.refundRequest.status === "completed"
                              ? "text-green-800 dark:text-green-200"
                              : "text-amber-800 dark:text-amber-200"
                          }`}
                        >
                          {selectedRequest.refundRequest.status === "completed"
                            ? "Your refund has been processed successfully."
                            : "Your refund request has been submitted and is currently under review by our team."}
                        </p>

                        {selectedRequest.refundRequest.preference && (
                          <div className="mt-3">
                            <p
                              className={`text-xs font-semibold uppercase tracking-wide ${
                                selectedRequest.refundRequest.status === "completed"
                                  ? "text-green-700 dark:text-green-400"
                                  : "text-amber-700 dark:text-amber-400"
                              }`}
                            >
                              Refund Method
                            </p>

                            <p
                              className={`mt-1 text-sm font-medium ${
                                selectedRequest.refundRequest.status === "completed"
                                  ? "text-green-900 dark:text-green-200"
                                  : "text-amber-900 dark:text-amber-200"
                              }`}
                            >
                              {selectedRequest.refundRequest.preference === "wallet"
                                ? "Wallet Credit"
                                : "Original Payment Method"}
                            </p>
                          </div>
                        )}

                        {typeof selectedRequest.refundRequest.amount === "number" && (
                          <div className="mt-3">
                            <p
                              className={`text-xs font-semibold uppercase tracking-wide ${
                                selectedRequest.refundRequest.status === "completed"
                                  ? "text-green-700 dark:text-green-400"
                                  : "text-amber-700 dark:text-amber-400"
                              }`}
                            >
                              Refund Amount
                            </p>

                            <p
                              className={`mt-1 text-lg font-bold ${
                                selectedRequest.refundRequest.status === "completed"
                                  ? "text-green-900 dark:text-green-200"
                                  : "text-amber-900 dark:text-amber-200"
                              }`}
                            >
                              ${selectedRequest.refundRequest.amount.toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>

                      <Link
                        href={`/requests/${selectedRequest.id}`}
                        className={`inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${
                          selectedRequest.refundRequest.status === "completed"
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-amber-600 hover:bg-amber-700"
                        }`}
                      >
                        Go to Request
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Message Area */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-slate-500">
                  No messages yet.
                </p>
              ) : (
                messages.map((item) => {
                  const fromCustomer = item.sender === "customer";

                  return (
                    <div
                      key={item.id}
                      className={`flex ${
                        fromCustomer ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          fromCustomer
                            ? "bg-purple-600 text-white"
                            : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-sm">
                          {item.message}
                        </p>

                        <p
                          className={`mt-1 text-[11px] ${
                            fromCustomer ? "text-purple-100" : "text-slate-500"
                          }`}
                        >
                          {fromCustomer ? "You" : "ShipIN Support"}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Action Panel */}
            {selectedTicket ? (
              selectedTicket.status === "resolved" ? (
                <div className="border-t border-slate-200 p-5 text-center dark:border-slate-800">
                  <p className="text-sm font-medium text-slate-500">
                    This support conversation has been resolved.
                  </p>
                </div>
              ) : (
                <div className="border-t border-slate-200 p-4 dark:border-slate-800">
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
                          handleSend();
                        }
                      }}
                      placeholder="Type your message..."
                      rows={2}
                      className="min-h-[52px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-purple-500 dark:border-slate-700 dark:bg-slate-950"
                    />

                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={sending || !message.trim()}
                      className="self-end rounded-xl bg-purple-600 p-3 text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send size={18} />
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-slate-400">
                    Press Enter to send • Shift + Enter for a new line
                  </p>
                </div>
              )
            ) : selectedRequest ? (
              <div className="border-t border-slate-200 p-5 dark:border-slate-800">
                <div className="flex flex-col gap-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-950/50 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      This refund offer does not have a support conversation yet.
                    </p>

                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Need help with this refund? Start a conversation with ShipIN Support.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={ticketCreating}
                    onClick={async () => {
                      if (!selectedRequest || ticketCreating) return;

                      try {
                        setTicketCreating(true);
                        const ticketId = await createTicket({
                          requestId: selectedRequest.id,
                          customerId,
                          category: "Refund",
                          subject: "Refund Offer Support",
                          firstMessage: "Hello, I have a question regarding the refund offered for this request.",
                        });

                        if (ticketId) {
                          openCreatedTicket(ticketId);
                          toast.success("Support conversation started.");
                        }
                      } catch (error) {
                        console.error("Failed to create ticket:", error);
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Failed to start support conversation."
                        );
                      } finally {
                        setTicketCreating(false);
                      }
                    }}
                    className="shrink-0 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-purple-700 disabled:opacity-50"
                  >
                    {ticketCreating ? "Starting..." : "Start Conversation"}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}