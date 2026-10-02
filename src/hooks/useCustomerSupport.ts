"use client";

import { useEffect, useState } from "react";

import {
  subscribeToCustomerSupportTickets,
  subscribeToSupportMessages,
  subscribeToRequests,
  markSupportTicketRead,
  createSupportTicket,
} from "@/lib/firestore";

import {
  SupportMessage,
  SupportTicket,
} from "@/types/support";

interface RefundOffer {
  offered: boolean;
  reason?: string;
  amount?: number;
  offeredAt?: any;
}

export default function useCustomerSupport(
  customerId: string
) {
  const [tickets, setTickets] =
    useState<SupportTicket[]>([]);

  const [requests, setRequests] =
    useState<any[]>([]);

  const [selectedTicket, setSelectedTicket] =
    useState<SupportTicket | null>(null);

  const [selectedRequest, setSelectedRequest] =
    useState<any | null>(null);

  const [messages, setMessages] =
    useState<SupportMessage[]>([]);

  const [refundOffer, setRefundOffer] =
    useState<RefundOffer | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [pendingTicketId, setPendingTicketId] =
    useState<string | null>(null);

  /*
   * ========================================
   * CUSTOMER SUPPORT TICKETS
   * ========================================
   */

  useEffect(() => {
    if (!customerId) {
      setTickets([]);
      setLoading(false);
      return;
    }

    const unsubscribe =
      subscribeToCustomerSupportTickets(
        customerId,
        (data) => {
          setTickets(data);
          setLoading(false);
        }
      );

    return unsubscribe;
  }, [customerId]);

  /*
   * ========================================
   * AUTO-SELECT NEWLY CREATED PENDING TICKET
   * ========================================
   */

  useEffect(() => {
    if (!pendingTicketId) {
      return;
    }

    const newTicket = tickets.find(
      (ticket) =>
        ticket.id === pendingTicketId
    );

    if (!newTicket) {
      return;
    }

    setSelectedRequest(null);
    setSelectedTicket(newTicket);
    setPendingTicketId(null);
  }, [
    tickets,
    pendingTicketId,
  ]);

  /*
   * ========================================
   * CUSTOMER REQUESTS
   * ========================================
   */

  useEffect(() => {
    if (!customerId) {
      setRequests([]);
      return;
    }

    const unsubscribe =
      subscribeToRequests(
        customerId,
        (data) => {
          setRequests(data);
        }
      );

    return unsubscribe;
  }, [customerId]);

  /*
   * ========================================
   * SELECT DEFAULT ITEM
   * ========================================
   *
   * Prefer an actual support ticket.
   * If there are no tickets, select a
   * refund-offered request.
   */

  useEffect(() => {
    if (
      selectedTicket ||
      selectedRequest
    ) {
      return;
    }

    if (tickets.length > 0) {
      setSelectedTicket(tickets[0]);
      return;
    }

    const refundRequest =
      requests.find(
        (request) =>
          request.status ===
            "refund_offered" &&
          request.refundOffer?.offered ===
            true
      );

    if (refundRequest) {
      setSelectedRequest(refundRequest);

      setRefundOffer(
        refundRequest.refundOffer
      );
    }
  }, [
    tickets,
    requests,
    selectedTicket,
    selectedRequest,
  ]);

  /*
   * ========================================
   * SELECTED TICKET MESSAGES
   * ========================================
   */

  useEffect(() => {
    if (!selectedTicket) {
      setMessages([]);
      return;
    }

    markSupportTicketRead(
      selectedTicket.id,
      "customer"
    );

    const unsubscribe =
      subscribeToSupportMessages(
        selectedTicket.id,
        setMessages
      );

    return unsubscribe;
  }, [selectedTicket]);

  /*
   * ========================================
   * SELECTED REQUEST REFUND OFFER
   * ========================================
   */

  useEffect(() => {
    if (!selectedRequest) {
      return;
    }

    setRefundOffer(
      selectedRequest.refundOffer?.offered ===
        true
        ? selectedRequest.refundOffer
        : null
    );
  }, [selectedRequest]);

  /*
   * ========================================
   * SELECTED TICKET REFUND OFFER
   * ========================================
   */

  useEffect(() => {
    if (!selectedTicket) {
      return;
    }

    const request =
      requests.find(
        (item) =>
          item.id ===
          selectedTicket.requestId
      );

    setSelectedRequest(
      request || null
    );

    const refundCompleted =
      request?.refundRequest?.status === "completed";

    setRefundOffer(
      !refundCompleted &&
        request?.refundOffer?.offered === true
        ? request.refundOffer
        : null
    );
  }, [
    selectedTicket,
    requests,
  ]);

  /*
   * ========================================
   * SEND MESSAGE
   * ========================================
   */

  async function sendMessage(
    ticketId: string,
    message: string
  ) {
    const trimmedMessage =
      message.trim();

    if (!trimmedMessage) {
      return;
    }

    const response = await fetch(
      `/api/support/${ticketId}/message`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          sender: "customer",
          message: trimmedMessage,
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
  }

  /*
   * ========================================
   * SELECT TICKET
   * ========================================
   */

  function selectTicket(
    ticket: SupportTicket
  ) {
    setSelectedRequest(null);
    setSelectedTicket(ticket);
  }

  /*
   * ========================================
   * SELECT REFUND REQUEST
   * ========================================
   */

  function selectRefundRequest(
    request: any
  ) {
    setSelectedTicket(null);
    setSelectedRequest(request);

    setMessages([]);

    setRefundOffer(
      request.refundOffer
    );
  }

  /*
   * ========================================
   * OPEN CREATED TICKET
   * ========================================
   */

  function openCreatedTicket(
    ticketId: string
  ) {
    setPendingTicketId(ticketId);
  }

  return {
    loading,

    tickets,

    requests,

    selectedTicket,

    selectedRequest,

    setSelectedTicket: selectTicket,

    setSelectedRequest,

    selectRefundRequest,

    createTicket: async (data: {
      requestId: string;
      customerId: string;
      category: string;
      subject: string;
      firstMessage: string;
    }) => {
      return await createSupportTicket(data);
    },

    openCreatedTicket,

    messages,

    refundOffer,

    sendMessage,
  };
}