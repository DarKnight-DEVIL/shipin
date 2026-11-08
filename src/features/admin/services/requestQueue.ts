import { collection, getDocs } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { toShipINError } from "@/utils/errors";
import type { Request } from "@/types/request";

export type AdminRequestFilter = string | null;

export async function getAllRequests(): Promise<Request[]> {
  try {
    const snapshot = await getDocs(collection(db, "requests"));
    return snapshot.docs.map((document) => ({
      id: document.id,
      ...(document.data() as Omit<Request, "id">),
    }));
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
