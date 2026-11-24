import { Timestamp } from "firebase/firestore";

import { customerApi } from "@/lib/customerApiClient";
import { toShipINError } from "@/utils/errors";
import { REQUEST_STATUS } from "@/features/requests/services/requestStatus";
import type { Request } from "@/types/request";

export type AdminRequestFilter = string | null;

/**
 * A Timestamp as it arrives over JSON. Both keys must be present: a plain
 * object that merely happens to have a `seconds` field is data, not a time.
 */
type SerializedTimestamp = { seconds: number; nanoseconds: number };

function isSerializedTimestamp(value: unknown): value is SerializedTimestamp {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);

  return (
    keys.length === 2 &&
    keys.includes("seconds") &&
    keys.includes("nanoseconds") &&
    typeof record.seconds === "number" &&
    Number.isFinite(record.seconds) &&
    typeof record.nanoseconds === "number" &&
    Number.isFinite(record.nanoseconds)
  );
}

/**
 * Rebuild every serialized Timestamp in a document as a real one, so code that
 * calls `.toMillis()`, checks `instanceof Timestamp`, or writes the value back
 * to Firestore keeps working.
 */
function restoreTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(restoreTimestamps);
  if (typeof value !== "object" || value === null) return value;

  if (isSerializedTimestamp(value)) {
    return new Timestamp(value.seconds, value.nanoseconds);
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = restoreTimestamps(entry);
  }

  return result;
}

export async function getAdminRequestPage(
  options: {
    status?: string | null;
    cursor?: string | null;
    limit?: number;
  } = {}
): Promise<{
  requests: Request[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  try {
    const search = new URLSearchParams();
    if (options.status) search.set("status", options.status);
    if (options.cursor) search.set("cursor", options.cursor);
    if (options.limit) search.set("limit", String(options.limit));

    const query = search.toString();

    const result = await customerApi<{
      success: boolean;
      requests: Array<Record<string, unknown> & { id: string }>;
      nextCursor: string | null;
      hasMore: boolean;
    }>(`/api/admin/requests${query ? `?${query}` : ""}`, { method: "GET" });

    return {
      requests: result.requests.map((doc) => {
        // One boundary assertion, over a payload the route sends whole. It used
        // to be an unchecked `as unknown as Request[]` layered on a seven-field
        // projection, so the queue's `items`, `quote`, `refundRequest` and
        // `refundOffer` reads were always `undefined` and rendered as blanks.
        const restored = restoreTimestamps(doc) as Record<string, unknown>;

        return {
          ...restored,
          // Required by the type and rendered without a guard in the purchasing
          // queue: a legacy document without items must not take the list down.
          items: Array.isArray(restored.items) ? restored.items : [],
        } as unknown as Request;
      }),
      nextCursor: result.nextCursor ?? null,
      hasMore: result.hasMore ?? false,
    };
  } catch (error) {
    throw toShipINError(error);
  }
}

/** Safety net for the page loops below: 200 pages is 20,000 documents. */
const MAX_PAGES = 200;

async function collectAllPages(
  options: { status?: string | null } = {}
): Promise<Request[]> {
  const collected: Request[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await getAdminRequestPage({ ...options, cursor });
    collected.push(...result.requests);

    if (!result.hasMore || !result.nextCursor) return collected;
    cursor = result.nextCursor;
  }

  return collected;
}

/**
 * Every request, whole. The screens that call this (the purchasing queue and
 * the audit console) sort and filter the full book client-side, so they need
 * the complete set — but it now arrives in bounded pages instead of one
 * multi-megabyte body.
 */
export async function getAllRequests(): Promise<Request[]> {
  try {
    return await collectAllPages();
  } catch (error) {
    throw toShipINError(error);
  }
}

export function matchesAdminRequestFilter(
  request: Request,
  filter: AdminRequestFilter
): boolean {
  if (!filter) return true;

  if (filter === "refund_requested") {
    return request.refundRequest?.status === "requested";
  }

  if (filter === "quote_requested") {
    return (
      request.quoteRegenerationRequested === true &&
      request.status !== "rejected" &&
      request.status !== "refunded"
    );
  }

  return request.status === filter;
}

/**
 * Operational priority for the admin queue. Lower numbers surface first.
 */
export function getAdminRequestPriority(request: Request): number {
  if (
    request.quoteRegenerationRequested === true &&
    request.status !== "rejected" &&
    request.status !== "refunded"
  ) {
    return 1;
  }

  if (request.refundRequest?.status === "requested") {
    return 2;
  }

  if (request.status === "submitted" || request.status === "review") {
    return 3;
  }

  if (request.status === "paid") return 4;
  if (request.status === "warehouse_received") return 5;
  if (request.status === "purchased") return 6;
  if (request.status === "packed" || request.status === "shipped") return 7;
  if (request.status === "awaiting_payment") return 8;
  if (request.status === "out_for_delivery") return 9;
  if (request.status === "delivered") return 10;

  if (
    request.refundOffer?.offered === true &&
    request.status !== "refunded" &&
    request.status !== "rejected"
  ) {
    return 11;
  }

  if (request.status === "refunded") return 12;
  if (request.status === "rejected") return 13;

  return 13;
}

const REQUEST_STATUS_VALUES: Set<string> = new Set(
  Object.values(REQUEST_STATUS)
);

/*
 * Filter names that are not status equalities. `refund_requested` collides
 * with a status value, but as a queue filter it means "the refund flag inside
 * the document is live, whatever the status" — pushing it down as a status
 * equality would return a different, much narrower set than the filter
 * promises. Both synthetic filters stay client-side over the full set.
 */
const SYNTHETIC_FILTERS: Set<string> = new Set([
  "refund_requested",
  "quote_requested",
]);

export async function getAdminRequestQueue(
  filter: AdminRequestFilter
): Promise<Request[]> {
  /*
   * A plain status is pushed down to the query, so the purchasing queue reads
   * only the documents it will show instead of the whole collection. The two
   * synthetic filters (refund/quote requests) are flags inside the document,
   * not statuses, so those stay client-side over the full set.
   */
  const serverStatus =
    filter &&
    !SYNTHETIC_FILTERS.has(filter) &&
    REQUEST_STATUS_VALUES.has(filter)
      ? filter
      : null;

  const requests = await collectAllPages({ status: serverStatus });

  return requests
    .filter((request) => matchesAdminRequestFilter(request, filter))
    .sort((a, b) => getAdminRequestPriority(a) - getAdminRequestPriority(b));
}
