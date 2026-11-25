import { NextRequest, NextResponse } from "next/server";
import type { DocumentData, Query } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { getAdminAuthError, requireAdmin } from "@/lib/adminAuth";
import { serializeFirestoreJson } from "@/lib/firestoreJson";
import {
  parseAdminPageParams,
  toAdminPage,
  InvalidAdminPageParamError,
  type AdminPageParams,
} from "@/lib/adminPagination";
import { REQUEST_STATUS } from "@/features/requests/services/requestStatus";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const REQUEST_STATUSES: string[] = Object.values(REQUEST_STATUS);

/**
 * The request queue, in bounded pages.
 *
 * This used to read the whole collection and return it as one body (see
 * docs/AUDIT.md §2.3). It now serves `?limit`/`?cursor` pages, newest first,
 * and an optional `?status=` filter — a single status or a comma-separated
 * list (served as a Firestore `in`, still one composite-indexed query) so the
 * warehouse inventory can ask for its three statuses in one paged read
 * instead of scanning the collection client-side.
 *
 * Each page carries the document whole. This used to project seven fields
 * (id, userId, customerName, email, status, createdAt, updatedAt) and the
 * client cast the result `as unknown as Request[]`. Nothing type-checks across
 * that boundary, so the missing fields showed up as blank screens instead of
 * an error: the purchasing queue read `items` and
 * `quote.breakdown.grandTotal`, the refund/quote filters read `refundRequest`
 * and `quoteRegenerationRequested`, and the queue sort read `purchasedAt`.
 */
async function handleGetRequests(request: NextRequest): Promise<NextResponse> {
  await requireAdmin(request);

  const url = new URL(request.url);

  let params: AdminPageParams;
  try {
    params = parseAdminPageParams(url);
  } catch (error) {
    if (error instanceof InvalidAdminPageParamError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid limit or cursor.",
          code: error.code,
        },
        { status: 400, headers: NO_STORE }
      );
    }
    throw error;
  }

  const statusParam = url.searchParams.get("status");
  let statuses: string[] = [];

  if (statusParam !== null) {
    statuses = [...new Set(statusParam.split(",").map((s) => s.trim()))].filter(
      Boolean
    );

    if (
      statuses.length === 0 ||
      statuses.length > 30 ||
      statuses.some((s) => !REQUEST_STATUSES.includes(s))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Unknown request status.",
          code: "UNKNOWN_STATUS",
        },
        { status: 400, headers: NO_STORE }
      );
    }
  }

  let query: Query<DocumentData> = adminDb.collection("requests");
  if (statuses.length === 1) {
    query = query.where("status", "==", statuses[0]);
  } else if (statuses.length > 1) {
    query = query.where("status", "in", statuses);
  }
  // firestore-list: pagination — cursor + hasMore per page.
  query = query.orderBy("createdAt", "desc").limit(params.limit);
  if (params.cursorMs !== null) {
    query = query.startAfter(Timestamp.fromMillis(params.cursorMs));
  }

  const snapshot = await query.get();

  const page = toAdminPage(snapshot.docs, params.limit, (doc) => {
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
    {
      success: true,
      requests: page.items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    },
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
