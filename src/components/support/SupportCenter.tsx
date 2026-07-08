"use client";

import { useState } from "react";

import useSupport from "@/hooks/useSupport";

import SupportTicketList from "./SupportTicketList";
import SupportConversation from "./SupportConversation";
import NewTicketModal from "./NewTicketModal";

interface Props {
  requestId: string;
  customerId: string;
  isAdmin?: boolean;
  canCreateTicket?: boolean;
}

export default function SupportCenter({
  requestId,
  customerId,
  isAdmin = false,
  canCreateTicket = true,
}: Props) {
  const support = useSupport(
    requestId,
    isAdmin
  );

  const [showModal, setShowModal] = useState(false);
  const [reply, setReply] = useState("");

  return (
    <>
      <div className="grid grid-cols-12 gap-6">

        {/* Ticket List */}
        <div className="col-span-4">

          <div className="flex justify-between items-center mb-4">

            <h2 className="text-2xl font-bold text-white">
              Support
            </h2>

            {!isAdmin && (
              canCreateTicket ? (
                <button
                  onClick={() => setShowModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-xl text-white font-medium"
                >
                  New Ticket
                </button>
              ) : (
                <div className="text-sm text-slate-500">
                  Support window closed.
                </div>
              )
            )}

          </div>

          <SupportTicketList
            tickets={support.tickets}
            selectedTicket={support.selectedTicket?.id}
            onSelect={support.setSelectedTicket}
          />

        </div>

        {/* Conversation */}
        <div className="col-span-8">

          {support.selectedTicket ? (
            <SupportConversation
              ticket={support.selectedTicket}
              messages={support.messages}
              reply={reply}
              onReplyChange={setReply}
              onSend={async () => {
                if (!reply.trim() || !support.selectedTicket) return;

                try {
                  await support.sendMessage({
                    ticketId: support.selectedTicket.id,
                    sender: isAdmin ? "admin" : "customer",
                    message: reply,
                  });

                  setReply("");
                } catch (err) {
                  console.error(err);
                }
              }}
              onResolve={async () => {
                if (!support.selectedTicket) return;

                await support.resolveTicket(
                  support.selectedTicket.id
                );
              }}
              isAdmin={isAdmin}
            />
          ) : (
            <div className="bg-slate-900 rounded-2xl h-full flex items-center justify-center text-slate-500 border border-slate-800">
              Select a ticket
            </div>
          )}

        </div>

      </div>

      <NewTicketModal
         open={showModal}
         onClose={() => setShowModal(false)}
         onCreate={async (
             category,
             subject,
             message
         ) => {
             try {
                 const ticketId =
                     await support.createTicket({
                         requestId,
                         customerId,
                         category,
                         subject,
                         firstMessage: message,
                    });

                 setShowModal(false);

                 setReply("");

                 console.log(
                     "Ticket created:",
                     ticketId
                 );

            } catch (error) {
              console.error(error);
              alert("Failed to create ticket.");
            }
         }}
       />
    </>
  );
}