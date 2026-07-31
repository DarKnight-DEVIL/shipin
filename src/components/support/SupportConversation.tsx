"use client";

import {
  SupportTicket,
  SupportMessage,
} from "@/types/support";

import IndividualSupportMessage from "./SupportMessage";
import ReplyBox from "./ReplyBox";

interface Props {
  ticket: SupportTicket;
  messages: SupportMessage[];
  reply: string;
  onReplyChange: (value: string) => void;
  onSend: () => void;
  onResolve?: () => void;
  isAdmin?: boolean;
}

export default function SupportConversation({
  ticket,
  messages,
  reply,
  onReplyChange,
  onSend,
  onResolve,
  isAdmin = false,
}: Props) {
  const resolved =
    ticket.status === "resolved";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

      {/* HEADER */}
      <div className="border-b border-slate-200 p-6 dark:border-slate-800">

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

          <div className="min-w-0">

            <h2 className="break-words text-2xl font-bold text-slate-950 dark:text-white">
              {ticket.subject}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Ticket #{ticket.ticketNumber}
            </p>

            <p className="mt-2 text-slate-600 dark:text-slate-400">
              {ticket.category}
            </p>

          </div>

          {/* STATUS */}
          <span
            className={`shrink-0 self-start rounded-full border px-4 py-2 text-sm font-semibold ${
              resolved
                ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400"
                : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            }`}
          >
            {resolved
              ? "Resolved"
              : "Open"}
          </span>

        </div>

      </div>

      {/* MESSAGES */}
      <div className="max-h-[500px] min-h-[250px] space-y-4 overflow-y-auto bg-slate-50/50 p-6 dark:bg-slate-950/30">

        {messages.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">

            <p className="text-sm text-slate-500 dark:text-slate-400">
              No messages yet.
            </p>

          </div>
        ) : (
          messages.map((message) => (
            <IndividualSupportMessage
              key={message.id}
              message={message}
            />
          ))
        )}

      </div>

      {/* REPLY */}
      <div className="border-t border-slate-200 p-6 dark:border-slate-800">

        <div className="space-y-4">

          <ReplyBox
            value={reply}
            onChange={onReplyChange}
            onSend={onSend}
            disabled={resolved}
          />

          {isAdmin && !resolved && (
            <button
              type="button"
              onClick={() =>
                onResolve?.()
              }
              className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white transition hover:bg-green-700"
            >
              Mark Resolved
            </button>
          )}

        </div>

      </div>

    </div>
  );
}