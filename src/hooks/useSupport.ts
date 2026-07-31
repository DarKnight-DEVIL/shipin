"use client";

import { useEffect, useState } from "react";

import {
  createSupportTicket,
  resolveSupportTicket,
  subscribeToSupportMessages,
  subscribeToSupportTickets,
  markSupportTicketRead,
} from "@/lib/firestore";

import {
  SupportMessage,
  SupportTicket,
} from "@/types/support";

export default function useSupport(requestId: string, isAdmin: boolean = false) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] =
    useState<SupportTicket | null>(null);

  const [messages, setMessages] = useState<SupportMessage[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!requestId) return;

    const unsubscribe =
      subscribeToSupportTickets(
        requestId,
        (data) => {
          setTickets(data);

          setSelectedTicket((current) => {
            if (!current && data.length)
              return data[0];

            if (!current) return null;

            return (
              data.find(
                (t) => t.id === current.id
              ) || null
            );
          });

          setLoading(false);
        }
      );

    return unsubscribe;
  }, [requestId]);

  useEffect(() => {
    if (!selectedTicket) {
      setMessages([]);
      return;
    }

    const role = isAdmin ? "admin" : "customer";
    markSupportTicketRead(selectedTicket.id, role);

    const unsubscribe =
      subscribeToSupportMessages(
        selectedTicket.id,
        setMessages
      );

    return unsubscribe;
  }, [selectedTicket, isAdmin]);

  return {
    loading,

    tickets,

    selectedTicket,

    setSelectedTicket,

    messages,

    createTicket: async (data: any) => {
      return await createSupportTicket(data);
    },

    sendMessage: async (data: any) => {
      const response = await fetch(
        `/api/support/${data.ticketId}/message`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            sender: data.sender,
            message: data.message,
          }),
        }
      );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            "Unable to send support message."
        );
      }

      return result;
    },

    resolveTicket: resolveSupportTicket,
  };
}