import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/auth";
import { quoteBodySchema, requestIdSchema } from "@/lib/validation";
import { withErrorHandler } from "@/utils/errors";
import { quoteExpiresAt } from "@/features/requests/services/quoteTtl";
import { QUOTABLE_STATUSES, isOneOf } from "@/features/requests/services/requestWorkflow";
import { REQUEST_STATUS } from "@/features/requests/services/requestStatus";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Round to currency precision so totals cannot carry float noise. */
function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * POST /api/requests/[requestId]/quote
 *
 * Publish a priced quotation to the customer. Admin only.
 *
 * The client sends what was typed into the quote panel; everything with
 * commercial meaning is derived here:
 *
 *  - `grandTotal` is recomputed from the components, so a mismatch between the
 *    displayed total and the sum cannot be charged;
 *  - `expiresAt` comes from the server clock and QUOTE_TTL_MS, so a client
 *    cannot hand itself a longer window;
 *  - `acceptedAt` is cleared, because a regenerated quote must be accepted
 *    again;
 *  - the request moves to `awaiting_payment` so the customer's pay step opens.
 */
export const POST = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ requestId: string }> }
  ) => {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const parsedParams = requestIdSchema.safeParse(await params);

    if (!parsedParams.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request ID." },
        { status: 400, headers: NO_STORE }
      );
    }

    const { requestId } = parsedParams.data;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body." },
        { status: 400, headers: NO_STORE }
      );
    }

    const parsedBody = quoteBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            parsedBody.error.issues[0]?.message ??
            "The quotation is not valid.",
        },
        { status: 400, headers: NO_STORE }
      );
    }

    const { quote: inputQuote } = parsedBody.data;

    const requestRef = adminDb.collection("requests").doc(requestId);
    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404, headers: NO_STORE }
      );
    }

    const data = snapshot.data() ?? {};
    const status = data.status as string | undefined;

    if (!isOneOf(status, QUOTABLE_STATUSES)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This request is past the quoting stage. A quote can only be issued before payment.",
        },
        { status: 409, headers: NO_STORE }
      );
    }

    const breakdown = {
      productsTotal: money(inputQuote.breakdown.productsTotal),
      domesticShipping: money(inputQuote.breakdown.domesticShipping),
      internationalShipping: money(inputQuote.breakdown.internationalShipping),
      serviceFee: money(inputQuote.breakdown.serviceFee),
      ...(inputQuote.breakdown.inspectionFee !== undefined
        ? { inspectionFee: money(inputQuote.breakdown.inspectionFee) }
        : {}),
      ...(inputQuote.breakdown.holdFee !== undefined
        ? { holdFee: money(inputQuote.breakdown.holdFee) }
        : {}),
      grandTotal: 0,
    };

    const grandTotal = money(
      breakdown.productsTotal +
        breakdown.domesticShipping +
        breakdown.internationalShipping +
        breakdown.serviceFee +
        (breakdown.inspectionFee ?? 0) +
        (breakdown.holdFee ?? 0)
    );

    if (!(grandTotal > 0)) {
      return NextResponse.json(
        {
          success: false,
          error: "The quotation total must be greater than zero.",
        },
        { status: 400, headers: NO_STORE }
      );
    }

    breakdown.grandTotal = grandTotal;

    const expiresAt = quoteExpiresAt();

    const previousQuote = data.quote ?? {};
    const version =
      typeof previousQuote.version === "number" ? previousQuote.version + 1 : 1;
    const regeneratedCount =
      typeof previousQuote.regeneratedCount === "number"
        ? previousQuote.regeneratedCount + 1
        : 1;

    await requestRef.update({
      quote: {
        version,
        items: inputQuote.items,
        breakdown,
        ...(inputQuote.serviceFeeRule
          ? { serviceFeeRule: inputQuote.serviceFeeRule }
          : {}),
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
        acceptedAt: null,
        regeneratedCount,
        expired: false,
        regenerationRequested: false,
      },
      status: REQUEST_STATUS.awaiting_payment,
      "statusHistory.awaiting_payment": FieldValue.serverTimestamp(),
      quoteRegenerationRequested: false,
      quoteRequestedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      quotedBy: admin.uid,
    });

    return NextResponse.json(
      { success: true, version, expiresAt: expiresAt.toISOString() },
      { status: 200, headers: NO_STORE }
    );
  }
);
