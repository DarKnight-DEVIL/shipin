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
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl">

      {/* Header */}
      <div className="border-b border-slate-800 p-6">

        <div className="flex justify-between items-center">

          <div>
            <h2 className="text-2xl font-bold text-white">
              {ticket.subject}
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              Ticket #{ticket.ticketNumber}
            </p>

            <p className="text-slate-400 mt-2">
              {ticket.category}
            </p>
          </div>

          <span
            className={`px-4 py-2 rounded-full text-sm font-semibold ${
              ticket.status === "resolved"
                ? "bg-green-500/20 text-green-400"
                : "bg-yellow-500/20 text-yellow-400"
            }`}
          >
            {ticket.status === "resolved"
              ? "Resolved"
              : "Open"}
          </span>

        </div>

      </div>

      {/* Messages */}

      <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">

        {messages.length === 0 ? (

          <p className="text-slate-500">
            No messages yet.
          </p>

        ) : (

          messages.map((message) => (
            <IndividualSupportMessage
              key={message.id}
              message={message}
            />
          ))

        )}

      </div>

      {/* Reply */}

      <div className="border-t border-slate-800 p-6">

        <div className="space-y-4">

          <ReplyBox
            value={reply}
            onChange={onReplyChange}
            onSend={onSend}
            disabled={ticket.status === "resolved"}
          />

          {isAdmin &&
            ticket.status !== "resolved" && (

              <button
                onClick={() => onResolve?.()}
                className="w-full bg-green-600 hover:bg-green-700 rounded-xl py-3 font-semibold text-white"
              >
                Mark Resolved
              </button>

          )}

        </div>

      </div>

    </div>
  );
}