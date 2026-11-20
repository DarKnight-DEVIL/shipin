import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { withErrorHandler } from "@/utils/errors";
import { isQuoteExpired } from "@/features/requests/services/quoteExpiry";
import { verifyCronRequest } from "@/lib/cronAuth";
import { createNotification } from "@/features/notifications/services/server";
import type { Request } from "@/types/request";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Quotes expired per run.
 *
 * One run is one bounded read plus, per matched quote, two writes and one
 * notification. Anything beyond this limit is picked up by the next hourly run,
 * because a quote that has been marked expired no longer matches the query —
 * the result set drains itself, so no cursor has to be carried between runs.
 */
const SWEEP_LIMIT = 200;

/**
 * POST /api/admin/requests/quotes/expire
 *
 * Cron-triggered (via GitHub Actions) endpoint that marks every quote past its
 * deadline as expired and notifies the customer.
 *
 * Authenticated by a timestamp + HMAC signature made with CRON_SECRET, verified
 * by the shared helper in `@/lib/cronAuth` (also used by the retention purge).
 * The timestamp prevents replay attacks (requests older than 5 min are rejected).
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET not configured");
    return NextResponse.json(
      { success: false, error: "Cron not configured.", code: "CONFIG_ERROR" },
      { status: 500, headers: NO_STORE }
    );
  }

  // Timestamp + HMAC, with a replay window and a small clock-skew allowance.
  if (!(await verifyCronRequest(request, cronSecret))) {
    return NextResponse.json(
      { success: false, error: "Unauthorized.", code: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE }
    );
  }

  const now = Date.now();

  // Ask for exactly the rows that need work instead of reading the collection:
  //
  //   quote.expired == false   set by every quote writer, and flipping it is
  //                            what takes the row out of this result set, so
  //                            consecutive runs make progress.
  //   quote.expiresAt <= now   the range. Firestore excludes documents missing
  //                            the field, so requests without a quote cost
  //                            nothing.
  //
  // firestore.indexes.json declares the composite index this needs, and
  // `check:firestore-indexes` fails the build if it goes missing — otherwise
  // Firestore rejects the query at runtime with FAILED_PRECONDITION.
  //
  // A quote whose stored data predates that invariant (no `expired` flag, or an
  // `expiresAt` that is not a Timestamp) cannot be matched by any query, because
  // Firestore has no "field is missing" filter. Migration
  // 002-normalize-quote-expiry brings those rows into this shape once.
  const snapshot = await adminDb
    .collection("requests")
    .where("quote.expired", "==", false)
    .where("quote.expiresAt", "<=", new Date(now))
    .orderBy("quote.expiresAt", "asc")
    .limit(SWEEP_LIMIT)
    .get();

  let expired = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() as Request;
    const quote = data.quote;

    // The query already guarantees both conditions; kept as a guard because a
    // wrong index or a widened filter would otherwise mutate live quotes.
    if (!quote || quote.expired) continue;
    if (!isQuoteExpired(quote.expiresAt)) continue;

    await doc.ref.update({
      "quote.expired": true,
      "quote.expiredAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Best-effort notification: a failure here must not fail the cron job,
    // because the quote is already marked expired in the DB.
    try {
      await createNotification(
        data.userId,
        doc.id,
        "Your quote has expired",
        `The quote for request #${doc.id} has expired. Please request a new quote to continue.`,
        "quote"
      );
    } catch (notifyError) {
      console.error("[Cron] Failed to send quote-expiry notification:", {
        requestId: doc.id,
        error:
          notifyError instanceof Error
            ? notifyError.message
            : String(notifyError),
      });
    }

    expired++;
  }

  return NextResponse.json(
    {
      success: true,
      scanned: snapshot.size,
      expired,
      timestamp: new Date(now).toISOString(),
    },
    { status: 200, headers: NO_STORE }
  );
});
