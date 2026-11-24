import { Timestamp } from "firebase/firestore";

import { customerApi } from "@/lib/customerApiClient";
import { toShipINError } from "@/utils/errors";
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

export async function getAllRequests(): Promise<Request[]> {
  try {
    const result = await customerApi<{
      success: boolean;
      requests: Array<Record<string, unknown> & { id: string }>;
    }>("/api/admin/requests", { method: "GET" });

    return result.requests.map((doc) => {
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
    });
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

export async function getAdminRequestQueue(
  filter: AdminRequestFilter
): Promise<Request[]> {
  const requests = await getAllRequests();

  return requests
    .filter((request) => matchesAdminRequestFilter(request, filter))
    .sort((a, b) => getAdminRequestPriority(a) - getAdminRequestPriority(b));
}
