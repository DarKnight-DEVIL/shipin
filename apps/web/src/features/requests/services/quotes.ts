import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { NotFoundError, PaymentError } from "@/utils/errors";

/**
 * Firestore signals a failed optimistic-concurrency precondition as gRPC 9 /
 * FAILED_PRECONDITION. Treated by code, never by message.
 */
function isPreconditionFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return (
    code === 9 ||
    code === "failed-precondition" ||
    code === "FAILED_PRECONDITION"
  );
}

/**
 * Write a quote only if the request is still the version that was read.
 *
 * Two admins saving at the same time used to produce a silent last-write-wins;
 * the precondition turns the loser into a visible conflict instead.
 */
async function updateRequestIfUnchanged(
  requestRef: DocumentReference,
  data: Record<string, unknown>,
  updateTime: Timestamp | undefined
): Promise<void> {
  try {
    if (updateTime) {
      await requestRef.update(data, { lastUpdateTime: updateTime });
      return;
    }
    await requestRef.update(data);
  } catch (error) {
    if (isPreconditionFailure(error)) {
      throw new PaymentError(
        "This request changed while the quote was being saved. Reload it and try again."
      );
    }
    throw error;
  }
}
import type { Request } from "@/types/request";
import { quoteExpiresAt } from "./quoteTtl";

/** Convert Firestore Timestamp or Date to JS Date. */
function toDate(val?: Date | Timestamp | string): Date {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (val instanceof Timestamp) return val.toDate();
  return new Date(val);
}

/**
 * Save a detailed quote to a request.
 * Called by admin QuotePanel when saving a quote.
 */
export async function saveDetailedQuote(
  requestId: string,
  quote: Request["quote"]
): Promise<void> {
  const normalizedQuote = {
    ...quote,
    createdAt: toDate(quote?.createdAt),
    expiresAt: toDate(quote?.expiresAt),
  };

  const requestRef = adminDb.collection("requests").doc(requestId);
  const snapshot = await requestRef.get();

  if (!snapshot.exists) {
    throw new NotFoundError("Request");
  }

  const requestData = snapshot.data();

  await updateRequestIfUnchanged(
    requestRef,
    {
      quote: {
        ...normalizedQuote,
        expired: false,
        regeneratedCount: (requestData?.quote?.regeneratedCount ?? 0) + 1,
      },
      status: "review",
      quoteRegenerationRequested: false,
      quoteRequestedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    snapshot.updateTime
  );
}

/**
 * Accept a quote for a request.
 * Called when customer accepts a quote.
 */
export async function acceptQuote(requestId: string): Promise<void> {
  const requestRef = adminDb.collection("requests").doc(requestId);
  const snapshot = await requestRef.get();

  if (!snapshot.exists) {
    throw new NotFoundError("Request");
  }

  const requestData = snapshot.data();
  const quote = requestData?.quote;

  if (!quote || quote.expired) {
    throw new PaymentError("No valid quote to accept");
  }

  await requestRef.update({
    "quote.acceptedAt": FieldValue.serverTimestamp(),
    "quote.expired": false,
    status: "quote_accepted",
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Regenerate a quote for a request.
 * Called when admin needs to regenerate a quote.
 */
export async function regenerateQuote(
  requestId: string,
  quote: Request["quote"]
): Promise<void> {
  const normalizedQuote = {
    ...quote,
    createdAt: new Date(),
    expiresAt: quoteExpiresAt(),
    acceptedAt: null,
    expired: false,
  };

  const requestRef = adminDb.collection("requests").doc(requestId);
  const snapshot = await requestRef.get();

  if (!snapshot.exists) {
    throw new NotFoundError("Request");
  }

  const requestData = snapshot.data();

  await updateRequestIfUnchanged(
    requestRef,
    {
      quote: {
        ...normalizedQuote,
        regeneratedCount: (requestData?.quote?.regeneratedCount ?? 0) + 1,
      },
      status: "review",
      quoteRegenerationRequested: true,
      quoteRequestedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    snapshot.updateTime
  );
}
