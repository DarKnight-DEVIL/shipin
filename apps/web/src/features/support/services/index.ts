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
} from 'firebase/firestore';
import { db } from "@/lib/firebaseDb";
import type { SupportTicket, SupportMessage } from '@/types/support';
import { toShipINError } from '@/utils/errors';

export async function createSupportTicket(
  data: Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'messages' | 'status'> & {
    firstMessage?: string;
  }
): Promise<string> {
  try {
    const ticketData: Record<string, unknown> = {
      ...data,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, 'supportTickets'), ticketData);

    if (data.firstMessage) {
      await addDoc(collection(db, 'supportMessages'), {
        ticketId: docRef.id,
        sender: data.customerId ? 'customer' : 'admin',
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
  message: Omit<SupportMessage, 'id' | 'createdAt'>
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'supportMessages'), {
      ...message,
      ticketId,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function resolveSupportTicket(ticketId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'supportTickets', ticketId), {
      status: 'resolved',
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function markSupportTicketRead(
  ticketId: string,
  role: 'customer' | 'admin'
): Promise<void> {
  try {
    const field = role === 'customer' ? 'customerUnread' : 'adminUnread';
    await updateDoc(doc(db, 'supportTickets', ticketId), {
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
      collection(db, 'supportTickets'),
      where('requestId', '==', requestId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<SupportTicket, 'id'>),
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
      collection(db, 'supportTickets'),
      where('customerId', '==', customerId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<SupportTicket, 'id'>),
    }));
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getSupportMessages(
  ticketId: string
): Promise<SupportMessage[]> {
  try {
    const q = query(
      collection(db, 'supportMessages'),
      where('ticketId', '==', ticketId),
      orderBy('createdAt', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<SupportMessage, 'id'>),
    }));
  } catch (error) {
    throw toShipINError(error);
  }
}

export function subscribeToSupportMessages(
  ticketId: string,
  callback: (messages: SupportMessage[]) => void
): () => void {
  const q = query(
    collection(db, 'supportMessages'),
    where('ticketId', '==', ticketId),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<SupportMessage, 'id'>),
      }))
    );
  });
}

export function subscribeToSupportTickets(
  requestId: string,
  callback: (tickets: SupportTicket[]) => void
): () => void {
  const q = query(
    collection(db, 'supportTickets'),
    where('requestId', '==', requestId)
  );
  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<SupportTicket, 'id'>),
      }))
    );
  });
}

export function subscribeToCustomerSupportTickets(
  customerId: string,
  callback: (tickets: import('@/types/support').SupportTicket[]) => void
): () => void {
  const q = query(
    collection(db, 'supportTickets'),
    where('customerId', '==', customerId)
  );
  return onSnapshot(q, (snapshot) => {
    const tickets = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<import('@/types/support').SupportTicket, 'id'>),
    }));
    callback(tickets);
  });
}

export function subscribeToAllSupportTickets(
  callback: (tickets: SupportTicket[]) => void
): () => void {
  const q = query(
    collection(db, 'supportTickets'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<SupportTicket, 'id'>),
      }))
    );
  });
}

// Convenience re-exports for compatibility
export function subscribeToRequest(
  requestId: string,
  callback: (request: import('@/types/request').Request | null) => void
): () => void {
  return onSnapshot(doc(db, 'requests', requestId), (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    callback({ id: snapshot.id, ...(snapshot.data() as Omit<import('@/types/request').Request, 'id'>) });
  });
}

export function subscribeToRequests(
  userId: string,
  callback: (requests: import('@/types/request').Request[]) => void
): () => void {
  const q = query(collection(db, 'requests'), where('userId', '==', userId));
  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<import('@/types/request').Request, 'id'>),
      }))
    );
  });
}