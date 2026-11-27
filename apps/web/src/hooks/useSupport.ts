"use client";

import { useEffect, useState } from "react";

import {
  createSupportTicket,
  resolveSupportTicket,
  subscribeToSupportMessages,
  subscribeToSupportTickets,
  markSupportTicketRead,
} from "@/features/support/client";

import { SupportMessage, SupportTicket } from "@/types/support";
import { customerApi } from "@/lib/customerApiClient";

export default function useSupport(
  requestId: string,
  isAdmin: boolean = false
) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(
    null
  );

  const [messages, setMessages] = useState<SupportMessage[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!requestId) return;

    const unsubscribe = subscribeToSupportTickets(requestId, (data) => {
      setTickets(data);

      setSelectedTicket((current) => {
        if (!current && data.length) return data[0];

        if (!current) return null;

        return data.find((t) => t.id === current.id) || null;
      });

      setLoading(false);
    });

    return unsubscribe;
  }, [requestId]);

  useEffect(() => {
    if (!selectedTicket) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      return;
    }

    const role = isAdmin ? "admin" : "customer";
    markSupportTicketRead(selectedTicket.id, role);

    const unsubscribe = subscribeToSupportMessages(
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

    createTicket: async (data: {
      subject: string;
      category: SupportTicket["category"];
      message: string;
      requestId: string;
      customerId: string;
      ticketNumber: string;
      firstMessage?: string;
    }) => {
      return await createSupportTicket(data);
    },

    sendMessage: async (data: {
      ticketId: string;
      sender: "customer" | "admin";
      message: string;
    }) => {
      return await customerApi(`/api/support/${data.ticketId}/message`, {
        method: "POST",
        body: {
          sender: data.sender,
          message: data.message,
        },
      });
    },

    resolveTicket: resolveSupportTicket,
  };
}
