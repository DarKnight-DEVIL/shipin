import {
  collection,
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
} from "firebase/firestore";
import { db } from "@/lib/firebaseDb";
import type {
  Request,
  AdditionalItemRequest,
  AdditionalItemRequestStatus,
} from "@/types/request";
import type { RequestStatus } from "@/features/requests/services/requestStatus";
import { toShipINError } from "@/utils/errors";
import { quoteExpiresAt } from "./quoteTtl";

/** Default shape used when snapshot.data() is missing (e.g. edge-case fallback). */
const EMPTY_REQUEST = {
  userId: "",
  email: "",
  status: "submitted" as RequestStatus,
  items: [] as Request["items"],
  warehouseOptions: {
    inspection: "standard" as const,
    shippingPreference: "approval" as const,
  },
  additionalItemRequests: [] as Request["additionalItemRequests"],
};


/**
 * Sortable columns.
 *
 * A closed set on purpose: each field/direction pair below needs its own
 * composite index, and `npm run check:firestore-indexes` can only prove an
 * index exists for a literal `orderBy(field, direction)`. Free-form sorts
 * failed at runtime with FAILED_PRECONDITION the first time a new column was
 * requested.
 */
export const REQUEST_SORT_FIELDS = ["createdAt", "updatedAt"] as const;
export type RequestSortField = (typeof REQUEST_SORT_FIELDS)[number];

/** Newest-N cap for the live listener (see subscribeToRequests). */
export const REQUEST_SUBSCRIPTION_LIMIT = 200;

export interface GetRequestsOptions {
  limit?: number;
  /** Firestore DocumentSnapshot to start after (for cursor pagination). */
  startAfter?: import("firebase/firestore").DocumentSnapshot;
  /** Sort field (default: 'createdAt'). Anything else is ignored. */
  sortField?: RequestSortField;
  /** Sort direction (default: 'desc'). */
  sortDirection?: "asc" | "desc";
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
      sortDirection = "desc",
    } = options;

    // Validated, not merely typed: the value can arrive from a URL parameter.
    const sortField: RequestSortField = REQUEST_SORT_FIELDS.includes(
      options.sortField as RequestSortField
    )
      ? (options.sortField as RequestSortField)
      : "createdAt";
    const direction = sortDirection === "asc" ? "asc" : "desc";

    let q = query(collection(db, "requests"), where("userId", "==", userId));

    // Literal field + direction pairs so each one maps to a declared composite
    // index in firestore.indexes.json (checked in CI).
    if (sortField === "updatedAt") {
      q = query(
        q,
        direction === "asc"
          ? orderBy("updatedAt", "asc")
          : orderBy("updatedAt", "desc")
      );
    } else {
      q = query(
        q,
        direction === "asc"
          ? orderBy("createdAt", "asc")
          : orderBy("createdAt", "desc")
      );
    }

    if (startAfter) {
      const { startAfter: startAfterFn } = await import("firebase/firestore");
      q = query(q, startAfterFn(startAfter));
    }

    // firestore-list: pagination — N + 1 detects the next page.
    q = query(q, limit(pageSize + 1)); // +1 to detect hasMore

    const snapshot = await getDocs(q);
    const docs = snapshot.docs;

    const hasMore = docs.length > pageSize;
    const results = hasMore ? docs.slice(0, pageSize) : docs;
    const lastDoc = results[results.length - 1];

    return {
      requests: results.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Request, "id">),
      })),
      lastDoc,
      hasMore,
    };
  } catch (error) {
    throw toShipINError(error);
  }
}

export async function getRequestById(
  requestId: string
): Promise<Request | null> {
  try {
    const snapshot = await getDoc(doc(db, "requests", requestId));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<Request, "id">) };
  } catch (error) {
    throw toShipINError(error);
  }
}

/** Metadata that tells a capped list apart from a complete one. */
export interface RequestSubscriptionMeta {
  /** True when the snapshot filled the cap, so older requests may exist. */
  truncated: boolean;
  /** The cap the query was given, so the UI can name the number it shows. */
  limit: number;
}

export function subscribeToRequests(
  userId: string,
  callback: (requests: Request[], meta: RequestSubscriptionMeta) => void,
  onError?: (error: Error) => void
): () => void {
  // Bounded and ordered: this feeds /requests and the customer support card,
  // and an unbounded listener re-downloads every request the customer has ever
  // filed on every change. Newest 200 is far more than either view shows, and
  // the error callback keeps a permission failure from becoming an unhandled
  // rejection inside onSnapshot.
  const q = query(
    collection(db, "requests"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    // firestore-list: visible — the header renders 200+ when the cap is hit.
    limit(REQUEST_SUBSCRIPTION_LIMIT)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      // A full page means "at least this many", not "exactly this many": the
      // listener cannot know whether a 201st request exists without reading it.
      // Callers that render a count have to say `200+` rather than 200, or a
      // capped list quietly looks complete.
      callback(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Request, "id">),
        })),
        {
          truncated: snapshot.size >= REQUEST_SUBSCRIPTION_LIMIT,
          limit: REQUEST_SUBSCRIPTION_LIMIT,
        }
      );
    },
    onError
  );
}

export function subscribeToRequest(
  requestId: string,
  callback: (request: Request | null) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    doc(db, "requests", requestId),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback({
        id: snapshot.id,
        ...(snapshot.data() as Omit<Request, "id">),
      });
    },
    onError
  );
}

export async function approveAdditionalItem(
  requestId: string,
  additionalItemId: string,
  price: number
): Promise<void> {
  try {
    const requestRef = doc(db, "requests", requestId);
    const snapshot = await getDoc(requestRef);
    const latestRequest = snapshot.exists()
      ? (snapshot.data() as Request)
      : ({ ...EMPTY_REQUEST, id: "" } as Request);

    const updatedAdditionalRequests = (
      latestRequest.additionalItemRequests || []
    ).map((item: AdditionalItemRequest) => {
      if (item.id === additionalItemId) {
        return {
          ...item,
          status: "awaiting_payment" as const,
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
    const requestRef = doc(db, "requests", requestId);
    const snapshot = await getDoc(requestRef);
    const latestRequest = snapshot.exists()
      ? (snapshot.data() as Request)
      : ({ ...EMPTY_REQUEST, id: "" } as Request);

    const updatedAdditionalRequests = (
      latestRequest.additionalItemRequests || []
    ).map((item: AdditionalItemRequest) => {
      if (item.id === additionalItemId) {
        return { ...item, status: "rejected" as const };
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
    const requestRef = doc(db, "requests", requestId);
    const snapshot = await getDoc(requestRef);
    const latestRequest = snapshot.exists()
      ? (snapshot.data() as Request)
      : ({ ...EMPTY_REQUEST, id: "" } as Request);

    const updatedAdditionalRequests = (
      latestRequest.additionalItemRequests || []
    ).map((item: AdditionalItemRequest) => {
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
