// No direct Firestore imports needed - using customerApi client

import { customerApi } from "@/lib/customerApiClient";
import { toShipINError } from "@/utils/errors";
import type { Request } from "@/types/request";

export type AdminRequestFilter = string | null;

// Restore a serialized Firestore Timestamp into a shape compatible with Request.createdAt / updatedAt
type TSSerialized = { seconds: number; nanoseconds: number };

function restoreTs(ts?: TSSerialized): {
  seconds: number;
  nanoseconds: number;
  toDate: () => Date;
  toMillis: () => number;
} | undefined {
  if (!ts || typeof ts.seconds !== "number") return undefined;
  const millis = ts.seconds * 1000 + (ts.nanoseconds ?? 0) / 1e6;
  return {
    seconds: ts.seconds,
    nanoseconds: ts.nanoseconds ?? 0,
    toDate: () => new Date(millis),
    toMillis: () => millis,
  };
}

export async function getAllRequests(): Promise<Request[]> {
  try {
    const result = await customerApi<{ success: boolean; requests: Array<{
      id: string;
      userId: string;
      customerName: string;
      email: string;
      status: string;
      createdAt?: TSSerialized;
      updatedAt?: TSSerialized;
    }> }>(
      "/api/admin/requests",
      { method: "GET" }
    );

    return result.requests.map((doc) => ({
      id: doc.id,
      userId: doc.userId,
      customerName: doc.customerName,
      email: doc.email,
      status: doc.status,
      createdAt: restoreTs(doc.createdAt),
      updatedAt: restoreTs(doc.updatedAt),
    })) as unknown as Request[];
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
    .sort(
      (a, b) => getAdminRequestPriority(a) - getAdminRequestPriority(b)
    );
}
