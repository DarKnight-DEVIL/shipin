"use client";

import { SupportTicket } from "@/types/support";

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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl">

      <div className="p-6 border-b border-slate-800">

        <h2 className="text-xl font-bold text-white">
          Support Tickets
        </h2>

      </div>

      <div>

        {tickets.length === 0 && (

          <div className="p-6 text-slate-500">

            No tickets yet.

          </div>

        )}

        {tickets.map((ticket) => (

          <button
            key={ticket.id}
            onClick={() => onSelect(ticket)}
            className={`w-full text-left p-5 border-b border-slate-800 hover:bg-slate-800 transition ${
              selectedTicket === ticket.id
                ? "bg-slate-800"
                : ""
            }`}
          >

            <div className="font-semibold text-white">

              {ticket.subject}

            </div>

            <div className="text-sm text-slate-400 mt-1">

              {ticket.category}

            </div>

            <div className="text-xs text-slate-500 mt-2">

              {ticket.status === "resolved"
                 ? "Resolved"
                 : "Open"}
            </div>

          </button>

        ))}

      </div>

    </div>
  );
}