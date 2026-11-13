import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";
import { requestIdSchema } from "@/lib/validation";
import { withErrorHandler } from "@/utils/errors";
import { isQuoteExpired } from "@/features/requests/services/quoteExpiry";
import { REQUOTABLE_STATUSES, isOneOf } from "@/features/requests/services/requestWorkflow";
import { REQUEST_STATUS } from "@/features/requests/services/requestStatus";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/requests/[requestId]/request-new-quote
 *
 * The customer asks for the prices to be refreshed (usually because the quote
 * lapsed). Owner only.
 *
 * This puts the request back in the admin's `review` queue and raises the
 * `quoteRegenerationRequested` flag the quote panel looks for. The old quote is
 * kept and marked expired rather than deleted, so the customer can still see
 * what was quoted and the admin has the previous numbers to work from.
 */
export const POST = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ requestId: string }> }
  ) => {
    const auth = await requireAuthWithProfile(request);
    if (auth instanceof NextResponse) return auth;

    const parsedParams = requestIdSchema.safeParse(await params);

    if (!parsedParams.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request ID." },
        { status: 400, headers: NO_STORE }
      );
    }

    const { requestId } = parsedParams.data;

    const requestRef = adminDb.collection("requests").doc(requestId);
    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404, headers: NO_STORE }
      );
    }

    const data = snapshot.data() ?? {};

    if (data.userId !== auth.profile.uid) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404, headers: NO_STORE }
      );
    }

    const status = data.status as string | undefined;

    if (!isOneOf(status, REQUOTABLE_STATUSES)) {
      return NextResponse.json(
        {
          success: false,
          error: "A new quote can only be requested before payment.",
        },
        { status: 409, headers: NO_STORE }
      );
    }

    // Already queued: report success so a retry does not surface an error.
    if (data.quoteRegenerationRequested === true) {
      return NextResponse.json(
        { success: true, alreadyRequested: true },
        { status: 200, headers: NO_STORE }
      );
    }

    const quote = data.quote;
    const expired = quote ? isQuoteExpired(quote.expiresAt) : false;

    const updates: Record<string, unknown> = {
      status: REQUEST_STATUS.review,
      "statusHistory.review": FieldValue.serverTimestamp(),
      quoteRegenerationRequested: true,
      quoteRequestedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (expired) {
      updates["quote.expired"] = true;
      updates["quote.regenerationRequested"] = true;
    } else if (quote) {
      updates["quote.regenerationRequested"] = true;
    }

    await requestRef.update(updates);

    return NextResponse.json(
      { success: true, alreadyRequested: false },
      { status: 200, headers: NO_STORE }
    );
  }
);
