"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

import useCustomerSupport from "@/hooks/useCustomerSupport";

interface Props {
  customerId: string;
}

function requestCode(id: string) {
  return id.slice(0, 6).toUpperCase();
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
  const [refundPreference, setRefundPreference] = useState<
    "wallet" | "original_payment"
  >("wallet");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [ticketCreating, setTicketCreating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refundOnlyRequests = requests.filter(
    (request) =>
      request.status === "refund_offered" &&
      request.refundOffer?.offered === true &&
      !tickets.some((ticket) => ticket.requestId === request.id)
  );

  const hasSidebarItems = tickets.length > 0 || refundOnlyRequests.length > 0;

  async function handleSend() {
    if (!selectedTicket || !message.trim() || sending) return;

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
    if (!requestId || refundSubmitting) return;

    try {
      setRefundSubmitting(true);
      const response = await fetch(`/api/requests/${requestId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preference: refundPreference,
          initiatedBy: "customer",
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to submit refund request.");
      }
      toast.success("Refund request submitted.");
    } catch (error) {
      console.error(error);
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
      <div className="h-[560px] animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50" />
    );
  }

  return (
    <div className="grid min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-12">
      {/* Sidebar */}
      <aside className="border-b border-slate-200 dark:border-slate-800 lg:col-span-4 lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Conversations
          </p>
        </div>

        <div className="max-h-[520px] overflow-y-auto p-2">
          {!hasSidebarItems ? (
            <div className="px-3 py-12 text-center">
              <MessageCircle
                size={22}
                className="mx-auto text-slate-300 dark:text-slate-600"
              />
              <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                No conversations yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Open a request if you need help with an order.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {tickets.map((ticket) => {
                const selected = selectedTicket?.id === ticket.id;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedTicket(ticket)}
                    className={`w-full rounded-xl px-3 py-3 text-left transition ${
                      selected
                        ? "bg-slate-100 dark:bg-slate-800"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium tabular-nums text-slate-400">
                          #{requestCode(ticket.requestId)}
                        </p>
                        <p className="mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-white">
                          {ticket.subject || "Support"}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {ticket.category}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {ticket.status === "resolved" ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                            Resolved
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            Open
                          </span>
                        )}
                        {ticket.customerUnread && (
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {refundOnlyRequests.map((request) => {
                const selected = selectedRequest?.id === request.id && !selectedTicket;
                return (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => selectRefundRequest(request)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      selected
                        ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
                        : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium tabular-nums text-slate-400">
                          #{requestCode(request.id)}
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
                          Refund offered
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {typeof request.refundOffer?.amount === "number"
                            ? `$${request.refundOffer.amount.toFixed(2)}`
                            : "Action needed"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                        Action
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <section className="flex min-h-[560px] flex-col lg:col-span-8">
        {!selectedTicket && !selectedRequest ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <MessageCircle
                size={28}
                className="mx-auto text-slate-300 dark:text-slate-600"
              />
              <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                Select a conversation
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Pick one from the left to view messages.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            {selectedTicket && (
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium tabular-nums text-slate-400">
                    Request #{requestCode(selectedTicket.requestId)}
                  </p>
                  <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedTicket.subject || "Support"}
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {selectedTicket.status}
                  </span>
                  <Link
                    href={`/requests/${selectedTicket.requestId}`}
                    className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline dark:hover:text-slate-200"
                  >
                    View request
                  </Link>
                </div>
              </div>
            )}

            {/* Active refund offer */}
            {refundOffer && !selectedRequest?.refundRequest && (
              <div className="border-b border-amber-200/80 bg-amber-50/80 px-4 py-4 dark:border-amber-500/20 dark:bg-amber-500/5 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      Refund offered
                      {typeof refundOffer.amount === "number" && (
                        <span className="ml-1.5 font-semibold tabular-nums">
                          · ${refundOffer.amount.toFixed(2)}
                        </span>
                      )}
                    </p>
                    {refundOffer.reason && (
                      <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">
                        {refundOffer.reason}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/requests/${selectedTicket?.requestId || selectedRequest?.id}`}
                    className="shrink-0 text-xs font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-300"
                  >
                    Open request
                  </Link>
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    How should we refund you?
                  </p>
                  {(
                    [
                      {
                        value: "wallet" as const,
                        title: "Wallet credit",
                        desc: "Instant credit to your ShipIN wallet",
                      },
                      {
                        value: "original_payment" as const,
                        title: "Original payment",
                        desc: "Back to the method you paid with",
                      },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5 transition ${
                        refundPreference === opt.value
                          ? "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900"
                          : "border-slate-200/80 bg-white/60 dark:border-slate-700 dark:bg-slate-900/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="support-refund-preference"
                        value={opt.value}
                        checked={refundPreference === opt.value}
                        onChange={() => setRefundPreference(opt.value)}
                        disabled={refundSubmitting}
                        className="mt-1 accent-slate-900 dark:accent-white"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {opt.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {opt.desc}
                        </p>
                      </div>
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={handleRefundRequest}
                    disabled={refundSubmitting}
                    className="mt-1 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                  >
                    {refundSubmitting ? "Submitting…" : "Request refund"}
                  </button>
                </div>
              </div>
            )}

            {/* Refund status */}
            {selectedRequest?.refundRequest && (
              <div
                className={`border-b px-4 py-4 sm:px-5 ${
                  selectedRequest.refundRequest.status === "completed"
                    ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/20 dark:bg-emerald-500/5"
                    : "border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/5"
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        selectedRequest.refundRequest.status === "completed"
                          ? "text-emerald-900 dark:text-emerald-200"
                          : "text-amber-900 dark:text-amber-200"
                      }`}
                    >
                      {selectedRequest.refundRequest.status === "completed"
                        ? "Refund completed"
                        : "Refund pending"}
                      {typeof selectedRequest.refundRequest.amount === "number" && (
                        <span className="ml-1.5 tabular-nums">
                          · ${selectedRequest.refundRequest.amount.toFixed(2)}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                      {selectedRequest.refundRequest.preference === "wallet"
                        ? "Wallet credit"
                        : "Original payment method"}
                      {selectedRequest.refundRequest.status !== "completed" &&
                        " · under review"}
                    </p>
                  </div>
                  <Link
                    href={`/requests/${selectedRequest.id}`}
                    className="shrink-0 text-xs font-medium text-slate-600 underline-offset-2 hover:underline dark:text-slate-300"
                  >
                    Open request
                  </Link>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
              {messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No messages yet
                </p>
              ) : (
                messages.map((item) => {
                  const fromCustomer = item.sender === "customer";
                  return (
                    <div
                      key={item.id}
                      className={`flex ${fromCustomer ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[75%] ${
                          fromCustomer
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {item.message}
                        </p>
                        <p
                          className={`mt-1 text-[10px] ${
                            fromCustomer
                              ? "text-slate-400 dark:text-slate-500"
                              : "text-slate-400"
                          }`}
                        >
                          {fromCustomer ? "You" : "ShipIN"}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            {selectedTicket ? (
              selectedTicket.status === "resolved" ? (
                <div className="border-t border-slate-100 px-4 py-4 text-center text-sm text-slate-500 dark:border-slate-800">
                  This conversation is resolved
                </div>
              ) : (
                <div className="border-t border-slate-100 p-3 dark:border-slate-800 sm:p-4">
                  <div className="flex gap-2">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Write a reply…"
                      rows={2}
                      className="min-h-[48px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-600 dark:focus:ring-white/10"
                    />
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={sending || !message.trim()}
                      className="self-end rounded-xl bg-slate-900 p-2.5 text-white transition hover:bg-slate-800 disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                      aria-label="Send"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Enter to send · Shift+Enter for new line
                  </p>
                </div>
              )
            ) : selectedRequest ? (
              <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                <div className="flex flex-col gap-3 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-950/60 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    No thread yet for this refund. Start one if you need help.
                  </p>
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
                          subject: "Refund offer",
                          firstMessage:
                            "Hi — I have a question about the refund offered on this request.",
                        });
                        if (ticketId) {
                          openCreatedTicket(ticketId);
                          toast.success("Conversation started");
                        }
                      } catch (error) {
                        console.error(error);
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not start conversation"
                        );
                      } finally {
                        setTicketCreating(false);
                      }
                    }}
                    className="shrink-0 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                  >
                    {ticketCreating ? "Starting…" : "Start conversation"}
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