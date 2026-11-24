import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { getAdminAuthError, requireAdmin } from "@/lib/adminAuth";
import { serializeFirestoreJson } from "@/lib/firestoreJson";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Every request document, whole.
 *
 * This used to project seven fields (id, userId, customerName, email, status,
 * createdAt, updatedAt) and the client cast the result `as unknown as
 * Request[]`. Nothing type-checks across that boundary, so the missing fields
 * showed up as blank screens instead of an error: the purchasing queue read
 * `items` and `quote.breakdown.grandTotal`, the refund/quote filters read
 * `refundRequest` and `quoteRegenerationRequested`, and the queue sort read
 * `purchasedAt`. Returning the document intact is also no more expensive —
 * `get()` already reads every document in full and Firestore bills reads, not
 * bytes on the wire.
 *
 * What this route still needs is pagination: it reads the whole collection
 * (see docs/AUDIT.md §2.3).
 */
async function handleGetRequests(request: NextRequest): Promise<NextResponse> {
  await requireAdmin(request);

  const snapshot = await adminDb.collection("requests").get();

  const requests = snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const serialized = serializeFirestoreJson(data) as Record<string, unknown>;

    return {
      ...serialized,
      id: doc.id,
      // The queue renders these four directly, so a legacy row without them
      // would print "undefined" in a table cell rather than nothing at all.
      userId: typeof data.userId === "string" ? data.userId : "",
      customerName:
        typeof data.customerName === "string" ? data.customerName : "",
      email: typeof data.email === "string" ? data.email : "",
      status: typeof data.status === "string" ? data.status : "",
    };
  });

  return NextResponse.json(
    { success: true, requests },
    { status: 200, headers: NO_STORE }
  );
}

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  try {
    return await handleGetRequests(request);
  } catch (error) {
    const authError = getAdminAuthError(error);
    if (authError.status !== 500) {
      return NextResponse.json(
        { success: false, error: authError.error },
        { status: authError.status, headers: NO_STORE }
      );
    }
    console.error("[AdminRequests] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to load requests." },
      { status: 500, headers: NO_STORE }
    );
  }
};
