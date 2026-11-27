import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  doc,
  onSnapshot,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebaseDb";
import type { Request } from "@/types/request";
import { toShipINError } from "@/utils/errors";

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

/*
 * Additional-item decisions are not a browser write. The rules deny updates to
 * `requests` from the client, and the quoted amounts are money: the decision is
 * made by the admin quote route, which owns the transaction. The three client
 * helpers that used to live here had no caller and would have failed silently
 * the first time somebody wired one up.
 */
