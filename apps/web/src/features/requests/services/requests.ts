import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  serverTimestamp,
  updateDoc,
  doc,
  onSnapshot,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from "@/lib/firebaseDb";
import type { Request, AdditionalItemRequest, AdditionalItemRequestStatus } from '@/types/request';
import type { Address } from '@/types/address';
import type { RequestStatus } from '@/features/requests/services/requestStatus';
import { toShipINError } from '@/utils/errors';
import { quoteExpiresAt } from './quoteTtl';

/** Default shape used when snapshot.data() is missing (e.g. edge-case fallback). */
const EMPTY_REQUEST = {
  userId: '',
  email: '',
  status: 'submitted' as RequestStatus,
  items: [] as Request['items'],
  warehouseOptions: { inspection: 'standard' as const, shippingPreference: 'approval' as const },
  additionalItemRequests: [] as Request['additionalItemRequests'],
};

export interface CreateRequestData {
  customerName: string;
  email: string;
  items: Request['items'];
  shippingAddress: Address;
  notes?: string;
  serviceSelections?: Request['serviceSelections'];
}

export async function createRequest(
  data: CreateRequestData,
  userId: string
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'requests'), {
      userId,
      customerName: data.customerName,
      email: data.email,
      items: data.items,
      shippingAddress: data.shippingAddress,
      notes: data.notes ?? '',
      serviceSelections: {
        inspection: data.serviceSelections?.inspection ?? 'standard',
        shippingPreference: data.serviceSelections?.shippingPreference ?? 'approval',
      },
      status: 'submitted',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    throw toShipINError(error);
  }
}

export interface GetRequestsOptions {
  limit?: number;
  /** Firestore DocumentSnapshot to start after (for cursor pagination). */
  startAfter?: import("firebase/firestore").DocumentSnapshot;
  /** Sort field (default: 'createdAt'). */
  sortField?: string;
  /** Sort direction (default: 'desc'). */
  sortDirection?: 'asc' | 'desc';
}

export interface PaginatedRequests {
  requests: Request[];
  /** Last document snapshot for next page cursor. */
  lastDoc: import("firebase/firestore").DocumentSnapshot | null;
  /** Whether there are more results (approximate). */
  hasMore: boolean;
}

export async function getRequests(
  userId: string,
  options: GetRequestsOptions = {}
): Promise<PaginatedRequests> {
  try {
    const {
      limit: pageSize = 20,
      startAfter,
      sortField = 'createdAt',
      sortDirection = 'desc',
    } = options;

    let q = query(
      collection(db, 'requests'),
      where('userId', '==', userId)
    );

    // Apply ordering and cursor
    // Note: Firestore requires a composite index for orderBy + where
    q = query(q, orderBy(sortField, sortDirection));

    if (startAfter) {
      const { startAfter: startAfterFn } = await import("firebase/firestore");
      q = query(q, startAfterFn(startAfter));
    }

    q = query(q, limit(pageSize + 1)); // +1 to detect hasMore

    const snapshot = await getDocs(q);
    const docs = snapshot.docs;

    const hasMore = docs.length > pageSize;
    const results = hasMore ? docs.slice(0, pageSize) : docs;
    const lastDoc = results[results.length - 1];

    return {
      requests: results.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Request, 'id'>),
      })),
      lastDoc,
      hasMore,
    };
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getRequestById(requestId: string): Promise<Request | null> {
  try {
    const snapshot = await getDoc(doc(db, 'requests', requestId));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<Request, 'id'>) };
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function updateRequestStatus(
  requestId: string,
  status: string,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'requests', requestId), {
      status,
      ...extra,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export function subscribeToRequests(
  userId: string,
  callback: (requests: Request[]) => void
): () => void {
  const q = query(collection(db, 'requests'), where('userId', '==', userId));
  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Request, 'id'>),
      }))
    );
  });
}

export function subscribeToRequest(
  requestId: string,
  callback: (request: Request | null) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(doc(db, 'requests', requestId), (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    callback({ id: snapshot.id, ...(snapshot.data() as Omit<Request, 'id'>) });
  }, onError);
}

/** Add a new request (convenience alias for createRequest). */
export async function addRequest(data: CreateRequestData, userId: string): Promise<string> {
  return createRequest(data, userId);
}

export async function rejectRequest(requestId: string, reason: string): Promise<void> {
  try {
    const requestRef = doc(db, 'requests', requestId);
    const snapshot = await getDoc(requestRef);
    const userId = snapshot.exists() ? snapshot.data()?.userId : null;
    await updateDoc(requestRef, {
      status: 'rejected',
      rejectionReason: reason,
      rejectedAt: serverTimestamp(),
      [`statusHistory.rejected`]: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (userId) {
      await addDoc(collection(db, 'notifications'), {
        userId,
        requestId,
        title: 'Request Rejected',
        message: `Your request has been rejected. Reason: ${reason}`,
        type: 'rejection',
        read: false,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function requestQuoteRegeneration(requestId: string): Promise<number> {
  try {
    const requestRef = doc(db, 'requests', requestId);
    const current = await getDoc(requestRef);
    const currentVersion = (current.data()?.quote?.version as number) ?? 0;
    const newVersion = currentVersion + 1;
    await updateDoc(requestRef, {
      quote: { ...current.data()?.quote, version: newVersion, regeneratedCount: (current.data()?.quote?.regeneratedCount ?? 0) + 1, createdAt: serverTimestamp() },
      quoteRegenerationRequested: false,
      updatedAt: serverTimestamp(),
    });
    return newVersion;
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function recordPayment(
  requestId: string,
  paymentData: { provider: 'paypal' | 'wallet'; amount: number; orderId: string; captureId?: string }
): Promise<void> {
  try {
    const requestRef = doc(db, 'requests', requestId);
    const snapshot = await getDoc(requestRef);
    if (!snapshot.exists()) throw new Error('Request not found');
    const request = snapshot.data();
    const previousPaid = request.payment?.amountPaid ?? 0;
    const grandTotal = request.quote?.breakdown?.grandTotal ?? 0;
    const totalPaid = previousPaid + paymentData.amount;
    const isFullyPaid = totalPaid >= grandTotal - 0.01;
    await updateDoc(requestRef, {
      payment: { provider: paymentData.provider, orderId: paymentData.orderId, captureId: paymentData.captureId ?? null, amountPaid: totalPaid, paidAt: serverTimestamp() },
      status: isFullyPaid ? 'paid' : 'awaiting_payment',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function markRequestPaid(
  requestId: string,
  paymentData: { provider: 'paypal' | 'wallet'; amount: number; orderId: string; captureId?: string }
): Promise<void> {
  try {
    const requestRef = doc(db, 'requests', requestId);
    const snapshot = await getDoc(requestRef);
    if (!snapshot.exists()) throw new Error('Request not found');
    const userId = snapshot.data()?.userId;
    const previousPaid = snapshot.data()?.payment?.amountPaid ?? 0;
    const grandTotal = snapshot.data()?.quote?.breakdown?.grandTotal ?? 0;
    const totalPaid = previousPaid + paymentData.amount;
    const isFullyPaid = totalPaid >= grandTotal - 0.01;
    await updateDoc(requestRef, {
      payment: { provider: paymentData.provider, orderId: paymentData.orderId, captureId: paymentData.captureId ?? null, amountPaid: totalPaid, paidAt: serverTimestamp() },
      status: isFullyPaid ? 'paid' : 'awaiting_payment',
      updatedAt: serverTimestamp(),
    });
    if (userId) {
      await addDoc(collection(db, 'notifications'), { userId, requestId, title: 'Payment Received', message: 'Your payment has been successfully recorded.', type: 'payment', read: false, createdAt: serverTimestamp() });
    }
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function addAdditionalItemRequest(
  requestId: string,
  item: { name: string; url: string; quantity: number }
): Promise<void> {
  try {
    const requestRef = doc(db, 'requests', requestId);
    const snapshot = await getDoc(requestRef);
    const latestRequest = snapshot.exists() ? (snapshot.data() as Request) : ({ ...EMPTY_REQUEST, id: '' } as Request);

    const newItemId = crypto.randomUUID();
    const newItem = {
      id: newItemId,
      name: item.name,
      url: item.url,
      quantity: item.quantity,
      status: 'pending' as const,
      repackingFee: 0,
      storageFee: 0,
      amountPaid: 0,
      orderChangeHold: true,
      requestedAt: serverTimestamp(),
    };

    await updateDoc(requestRef, {
      additionalItemRequests: [...(latestRequest.additionalItemRequests || []), newItem],
      orderChange: {
        active: true,
        requiresRepacking: latestRequest.status === 'packed',
        repackingFee: latestRequest.status === 'packed' ? 2 : 0,
        storageFee: 0,
        storageFeeApplied: false,
        startedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function approveAdditionalItem(
  requestId: string,
  additionalItemId: string,
  price: number
): Promise<void> {
  try {
    const requestRef = doc(db, 'requests', requestId);
    const snapshot = await getDoc(requestRef);
    const latestRequest = snapshot.exists() ? (snapshot.data() as Request) : ({ ...EMPTY_REQUEST, id: '' } as Request);

    const updatedAdditionalRequests = (latestRequest.additionalItemRequests || []).map((item: AdditionalItemRequest) => {
      if (item.id === additionalItemId) {
        return {
          ...item,
          status: 'awaiting_payment' as const,
          unitPrice: price,
          subtotal: price,
          serviceFee: 0,
          repackingFee: 0,
          storageFee: 0,
          totalDue: price,
          quote: {
            unitPrice: price,
            subtotal: price,
            serviceFee: 0,
            repackingFee: 0,
            storageFee: 0,
            totalDue: price,
            createdAt: new Date(),
            expiresAt: quoteExpiresAt(),
            reviewedAt: new Date(),
            approvedAt: new Date(),
          },
        };
      }
      return item;
    });

    await updateDoc(requestRef, {
      additionalItemRequests: updatedAdditionalRequests,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function rejectAdditionalItem(
  requestId: string,
  additionalItemId: string
): Promise<void> {
  try {
    const requestRef = doc(db, 'requests', requestId);
    const snapshot = await getDoc(requestRef);
    const latestRequest = snapshot.exists() ? (snapshot.data() as Request) : ({ ...EMPTY_REQUEST, id: '' } as Request);

    const updatedAdditionalRequests = (latestRequest.additionalItemRequests || []).map((item: AdditionalItemRequest) => {
      if (item.id === additionalItemId) {
        return { ...item, status: 'rejected' as const };
      }
      return item;
    });

    await updateDoc(requestRef, {
      additionalItemRequests: updatedAdditionalRequests,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function updateAdditionalItemStatus(
  requestId: string,
  additionalItemId: string,
  status: AdditionalItemRequestStatus
): Promise<void> {
  try {
    const requestRef = doc(db, 'requests', requestId);
    const snapshot = await getDoc(requestRef);
    const latestRequest = snapshot.exists() ? (snapshot.data() as Request) : ({ ...EMPTY_REQUEST, id: '' } as Request);

    const updatedAdditionalRequests = (latestRequest.additionalItemRequests || []).map((item: AdditionalItemRequest) => {
      if (item.id === additionalItemId) {
        return { ...item, status };
      }
      return item;
    });

    await updateDoc(requestRef, {
      additionalItemRequests: updatedAdditionalRequests,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toShipINError(error);
  }
}