"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner"; // Update import based on your toast library

import type { Request } from "@/types/request";
import useSupport from "@/hooks/useSupport";

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

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold text-white">Support</h2>
        <p className="mt-2 text-slate-400">Loading support tickets...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold text-white">Support</h2>
        <p className="mt-2 text-slate-400">
          Support tickets for request #{request.id.slice(0, 6)}
        </p>
      </div>

      {tickets.length === 0 ? (
        /* NO TICKETS */
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <div className="text-lg font-medium text-white">
            No support tickets
          </div>
          <p className="mt-2 text-sm text-slate-400">
            The customer has not opened a support ticket for this request.
          </p>
        </div>
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
                  <div className="flex min-h-[350px] items-center justify-center text-center">
                    <div>
                      <p className="font-medium text-slate-300">
                        No messages yet
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Messages for this ticket will appear here.
                      </p>
                    </div>
                  </div>
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