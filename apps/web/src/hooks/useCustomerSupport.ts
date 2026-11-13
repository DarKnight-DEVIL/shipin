"use client";

import { useEffect, useRef, useState } from "react";

import {
  subscribeToCustomerSupportTickets,
  subscribeToSupportMessages,
  markSupportTicketRead,
  createSupportTicket,
} from "@/features/support/services";
import { subscribeToRequests } from "@/features/requests/services/requests";

import {
  SupportMessage,
  SupportTicket,
} from "@/types/support";
import type { Request } from "@/types/request";

interface RefundOffer {
  offered: boolean;
  reason?: string;
  amount?: number;
  offeredAt?: import("firebase/firestore").Timestamp;
}

interface RefundRequest {
  status: "requested" | "processing" | "completed";
  preference: "wallet" | "original_payment";
  amount: number;
  walletAmount?: number;
  paypalAmount?: number;
}

interface CustomerRequest extends Request {
  refundOffer?: RefundOffer;
  refundRequest?: RefundRequest;
}

export default function useCustomerSupport(
  customerId: string
) {
  const [tickets, setTickets] =
    useState<SupportTicket[]>([]);

  const [requests, setRequests] =
    useState<CustomerRequest[]>([]);

  const [selectedTicket, setSelectedTicket] =
    useState<SupportTicket | null>(null);

  const [selectedRequest, setSelectedRequest] =
    useState<CustomerRequest | null>(null);

  const [messages, setMessages] =
    useState<SupportMessage[]>([]);

  const [refundOffer, setRefundOffer] =
    useState<RefundOffer | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [pendingTicketId, setPendingTicketId] =
    useState<string | null>(null);

  // Tracks the previous customer so the effect below only clears data on a real change.
  const prevCustomerIdRef =
    useRef<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (prevCustomerIdRef.current === null) {
      prevCustomerIdRef.current = customerId || null;
      return;
    }
    if (customerId !== prevCustomerIdRef.current) {
      prevCustomerIdRef.current = customerId || null;
      if (!customerId) {
        setTickets([]);
        setRequests([]);
        setLoading(false);
      }
    }
  }, [customerId]);
/* eslint-enable react-hooks/set-state-in-effect */

  // Second useEffect - subscribe to tickets
  useEffect(() => {
    if (!customerId) return;

    const unsubscribe = subscribeToCustomerSupportTickets(
      customerId,
      (data) => {
        setTickets(data);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [customerId]);

  // Consume pending ticket id once the ticket appears in the stream.
  if (pendingTicketId) {
    const newTicket = tickets.find(
      (ticket) => ticket.id === pendingTicketId
    );

    if (newTicket) {
      setSelectedRequest(null);
      setSelectedTicket(newTicket);
      setPendingTicketId(null);
    }
  }

  useEffect(() => {
    if (!customerId) return;

    const unsubscribe = subscribeToRequests(
      customerId,
      (data) => {
        setRequests(data as CustomerRequest[]);
      }
    );

    return unsubscribe;
  }, [customerId]);

  useEffect(() => {
    if (
      selectedTicket ||
      selectedRequest
    ) {
      return;
    }

    if (tickets.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedTicket(tickets[0]);
      return;
    }

    const refundRequest =
      requests.find(
        (request) =>
          request.status === "refund_offered" &&
          request.refundOffer?.offered === true &&
          !tickets.some((ticket) => ticket.requestId === request.id)
      );

    if (refundRequest) {
      setSelectedRequest(refundRequest);
    }
  }, [tickets, requests, selectedTicket, selectedRequest]);

  useEffect(() => {
    if (!selectedTicket) {
      return;
    }

    markSupportTicketRead(selectedTicket.id, "customer");

    const unsubscribe =
      subscribeToSupportMessages(
        selectedTicket.id,
        (messages: SupportMessage[]) => setMessages(messages)
      );

    return unsubscribe;
  }, [selectedTicket]);

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

    // Syncing selected request when ticket changes is intentional for immediate feedback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedRequest(
      request || null
    );

    const refundCompleted =
      request?.refundRequest?.status === "completed";

    setRefundOffer(
      !refundCompleted &&
        request?.refundOffer?.offered === true
        ? request.refundOffer!
        : null
    );
  }, [
    selectedTicket,
    requests,
  ]);

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

  function selectTicket(
    ticket: SupportTicket
  ) {
    setSelectedRequest(null);
    setSelectedTicket(ticket);
  }

  function selectRefundRequest(request: CustomerRequest) {
    setSelectedTicket(null);
    setSelectedRequest(request);

    setMessages([]);

    setRefundOffer(
      request.refundOffer ?? null
    );
  }

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
      category:
        | "Shipment"
        | "Tracking"
        | "Payment"
        | "Refund"
        | "Customs"
        | "Missing Item"
        | "Wrong Item"
        | "Other";
      subject: string;
      ticketNumber: string;
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