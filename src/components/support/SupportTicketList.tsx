"use client";

import { MessageCircle } from "lucide-react";

import { SupportTicket } from "@/types/support";
import EmptyState from "@/components/ui/EmptyState";

interface Props {
  tickets: SupportTicket[];
  selectedTicket?: string;
  onSelect: (ticket: SupportTicket) => void;
}

export default function SupportTicketList({
  tickets,
  selectedTicket,
  onSelect,
}: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

      {/* HEADER */}
      <div className="border-b border-slate-200 p-6 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-950 dark:text-white">
          Support Tickets
        </h2>
      </div>

      {/* EMPTY STATE */}
      {tickets.length === 0 && (
        <EmptyState
          icon={<MessageCircle size={26} />}
          title="No support tickets"
          description="You don't have any support tickets yet. Create one if you need help with a request."
        />
      )}

      {/* TICKET LIST */}
      {tickets.map((ticket) => {
        const selected =
          selectedTicket === ticket.id;

        const resolved =
          ticket.status === "resolved";

        return (
          <button
            key={ticket.id}
            type="button"
            onClick={() => onSelect(ticket)}
            className={`w-full border-b border-slate-200 p-5 text-left transition last:border-b-0 dark:border-slate-800 ${
              selected
                ? "bg-purple-50 dark:bg-purple-500/10"
                : "hover:bg-slate-50 dark:hover:bg-slate-800/70"
            }`}
          >
            <div className="flex items-start justify-between gap-3">

              <div className="min-w-0">
                <div
                  className={`truncate font-semibold ${
                    selected
                      ? "text-purple-700 dark:text-purple-300"
                      : "text-slate-950 dark:text-white"
                  }`}
                >
                  {ticket.subject}
                </div>

                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {ticket.category}
                </div>
              </div>

              {/* STATUS */}
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  resolved
                    ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400"
                    : "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                }`}
              >
                {resolved
                  ? "Resolved"
                  : "Open"}
              </span>

            </div>
          </button>
        );
      })}

    </div>
  );
}