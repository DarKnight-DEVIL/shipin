import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";
import { requestIdSchema } from "@/lib/validation";
import { withErrorHandler } from "@/utils/errors";
import { isQuoteExpired } from "@/features/requests/services/quoteExpiry";
import { PAYABLE_STATUSES, isOneOf } from "@/features/requests/services/requestWorkflow";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/requests/[requestId]/approve-quote
 *
 * The customer accepts the current quotation. Owner only.
 *
 * Expiry is re-checked here rather than trusted from the browser: the page
 * already hides the button once the countdown ends, but the price the quote
 * was built from can have moved on, so the server has the final say.
 *
 * The request stays in `awaiting_payment`; only the PayPal capture handler is
 * allowed to mark it `paid`.
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

    // Another customer's request must not be distinguishable from a missing one.
    if (data.userId !== auth.profile.uid) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404, headers: NO_STORE }
      );
    }

    const status = data.status as string | undefined;

    if (!isOneOf(status, PAYABLE_STATUSES)) {
      return NextResponse.json(
        {
          success: false,
          error: "This request is not awaiting a quote decision.",
        },
        { status: 409, headers: NO_STORE }
      );
    }

    const quote = data.quote;

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "This request has no quotation yet." },
        { status: 409, headers: NO_STORE }
      );
    }

    if (isQuoteExpired(quote.expiresAt)) {
      return NextResponse.json(
        {
          success: false,
          error: "This quotation has expired. Please request a new quote.",
          code: "QUOTE_EXPIRED",
        },
        { status: 409, headers: NO_STORE }
      );
    }

    // Accepting twice is harmless, so treat it as success rather than an error
    // (a double-click or a retried request should not look like a failure).
    if (!quote.acceptedAt) {
      await requestRef.update({
        "quote.acceptedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json(
      { success: true },
      { status: 200, headers: NO_STORE }
    );
  }
);
