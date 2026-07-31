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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

        {/* Ticket List */}
        <div className="lg:col-span-4">

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <h2 className="text-2xl font-bold text-slate-950 dark:text-white">
              Support
            </h2>

            {!isAdmin &&
              (canCreateTicket ? (
                <button
                  type="button"
                  onClick={() =>
                    setShowModal(true)
                  }
                  className="rounded-xl bg-purple-600 px-4 py-2 font-medium text-white transition hover:bg-purple-700"
                >
                  New Ticket
                </button>
              ) : (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Support window closed.
                </div>
              ))}

          </div>

          <SupportTicketList
            tickets={support.tickets}
            selectedTicket={
              support.selectedTicket?.id
            }
            onSelect={
              support.setSelectedTicket
            }
          />

        </div>

        {/* Conversation */}
        <div className="lg:col-span-8">

          {support.selectedTicket ? (
            <SupportConversation
              ticket={
                support.selectedTicket
              }
              messages={
                support.messages
              }
              reply={reply}
              onReplyChange={setReply}
              onSend={async () => {
                if (
                  !reply.trim() ||
                  !support.selectedTicket
                ) {
                  return;
                }

                try {
                  await support.sendMessage({
                    ticketId:
                      support
                        .selectedTicket.id,

                    sender: isAdmin
                      ? "admin"
                      : "customer",

                    message: reply,
                  });

                  setReply("");
                } catch (err) {
                  console.error(err);
                }
              }}
              onResolve={async () => {
                if (
                  !support.selectedTicket
                ) {
                  return;
                }

                await support.resolveTicket(
                  support.selectedTicket.id
                );
              }}
              isAdmin={isAdmin}
            />
          ) : (
            <div className="flex min-h-[300px] h-full items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">
                  Select a ticket
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Choose a support ticket to
                  view the conversation.
                </p>
              </div>
            </div>
          )}

        </div>

      </div>

      <NewTicketModal
        open={showModal}
        onClose={() =>
          setShowModal(false)
        }
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

            alert(
              "Failed to create ticket."
            );
          }
        }}
      />
    </>
  );
}