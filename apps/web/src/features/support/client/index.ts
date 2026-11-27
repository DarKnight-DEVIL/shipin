import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
  onSnapshot,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebaseDb";
import type { SupportTicket, SupportMessage } from "@/types/support";
import { toShipINError } from "@/utils/errors";

/** Newest tickets loaded for a request/customer/admin queue. */
export const SUPPORT_TICKET_LIMIT = 100;

/** Newest messages held for an open thread. */
export const SUPPORT_MESSAGE_LIMIT = 200;

export async function createSupportTicket(
  data: Omit<
    SupportTicket,
    "id" | "createdAt" | "updatedAt" | "messages" | "status"
  > & {
    firstMessage?: string;
  }
): Promise<string> {
  try {
    const ticketData: Record<string, unknown> = {
      ...data,
      status: "open",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, "supportTickets"), ticketData);

    if (data.firstMessage) {
      await addDoc(collection(db, "supportMessages"), {
        ticketId: docRef.id,
        // Denormalised so the read rule can authorise a message without a
        // get() of its parent ticket on every document in the thread.
        customerId: data.customerId ?? null,
        sender: data.customerId ? "customer" : "admin",
        message: data.firstMessage,
        createdAt: serverTimestamp(),
      });
    }

    return docRef.id;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function addSupportMessage(
  ticketId: string,
  message: Omit<SupportMessage, "id" | "createdAt">,
  // Required: the create rule only accepts a customer message that names its
  // owner, and the read rule trusts that field. An optional id would let a
  // caller compile and then have every customer write denied.
  customerId: string
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, "supportMessages"), {
      ...message,
      ticketId,
      customerId,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function resolveSupportTicket(ticketId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "supportTickets", ticketId), {
      status: "resolved",
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function markSupportTicketRead(
  ticketId: string,
  role: "customer" | "admin"
): Promise<void> {
  try {
    const field = role === "customer" ? "customerUnread" : "adminUnread";
    await updateDoc(doc(db, "supportTickets", ticketId), {
      [field]: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getSupportTicketsByRequest(
  requestId: string
): Promise<SupportTicket[]> {
  try {
    const q = query(
      collection(db, "supportTickets"),
      where("requestId", "==", requestId),
      // firestore-list: internal — a request has only a handful of tickets.
      limit(SUPPORT_TICKET_LIMIT)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<SupportTicket, "id">),
    }));
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getSupportTicketsByCustomer(
  customerId: string
): Promise<SupportTicket[]> {
  try {
    const q = query(
      collection(db, "supportTickets"),
      where("customerId", "==", customerId),
      // firestore-list: internal — newest window of the customer's tickets.
      limit(SUPPORT_TICKET_LIMIT)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<SupportTicket, "id">),
    }));
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getSupportMessages(
  ticketId: string
): Promise<SupportMessage[]> {
  try {
    // Newest first so the cap keeps the recent conversation, then restore the
    // oldest-to-newest order the thread renders in.
    const q = query(
      collection(db, "supportMessages"),
      where("ticketId", "==", ticketId),
      orderBy("createdAt", "desc"),
      // firestore-list: internal — an open thread holds at most this window.
      limit(SUPPORT_MESSAGE_LIMIT)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<SupportMessage, "id">),
      }))
      .reverse();
  } catch (error) {
    throw toShipINError(error);
  }
}

export function subscribeToSupportMessages(
  ticketId: string,
  callback: (messages: SupportMessage[]) => void
): () => void {
  const q = query(
    collection(db, "supportMessages"),
    where("ticketId", "==", ticketId),
    orderBy("createdAt", "desc"),
    // firestore-list: internal — the thread shows the newest window.
    limit(SUPPORT_MESSAGE_LIMIT)
  );
  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<SupportMessage, "id">),
        }))
        .reverse()
    );
  });
}

export function subscribeToSupportTickets(
  requestId: string,
  callback: (tickets: SupportTicket[]) => void
): () => void {
  const q = query(
    collection(db, "supportTickets"),
    where("requestId", "==", requestId),
    // firestore-list: internal — a request has only a handful of tickets.
    limit(SUPPORT_TICKET_LIMIT)
  );
  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<SupportTicket, "id">),
      }))
    );
  });
}

export function subscribeToCustomerSupportTickets(
  customerId: string,
  callback: (tickets: import("@/types/support").SupportTicket[]) => void
): () => void {
  const q = query(
    collection(db, "supportTickets"),
    where("customerId", "==", customerId),
    // firestore-list: internal — newest window of the customer's tickets.
    limit(SUPPORT_TICKET_LIMIT)
  );
  return onSnapshot(q, (snapshot) => {
    const tickets = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<import("@/types/support").SupportTicket, "id">),
    }));
    callback(tickets);
  });
}

export function subscribeToAllSupportTickets(
  callback: (tickets: SupportTicket[]) => void
): () => void {
  const q = query(
    collection(db, "supportTickets"),
    orderBy("createdAt", "desc"),
    // firestore-list: internal — the admin sidebar shows the newest queue.
    limit(SUPPORT_TICKET_LIMIT)
  );
  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<SupportTicket, "id">),
      }))
    );
  });
}

// Same queries as the request service. They used to be duplicated here, which
// meant the bound/error handling added there could silently be missing for the
// support screens; re-export the single implementation instead.
export {
  subscribeToRequest,
  subscribeToRequests,
} from "@/features/requests/client/requests";
