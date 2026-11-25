import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { getAdminAuthError, requireAdmin } from "@/lib/adminAuth";
import {
  InvalidAdminPageParamError,
  parseAdminPageParams,
  toAdminPage,
} from "@/lib/adminPagination";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export interface AdminCustomer {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role?: string;
  walletBalance: number;
}

/** Bumped when the refund payload changes shape. */
// Not exported: Next treats every extra export of a route module as a route
// contract violation and fails the build on it.
const REFUND_SCHEMA_VERSION = 2;

export interface RefundRequestDetails {
  id: string;
  userId: string;
  preference: string;
  totalRefundAmount: number;
  walletRefundAmount: number;
}

async function handleGetCustomers(request: NextRequest): Promise<NextResponse> {
  await requireAdmin(request);

  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId") || null;

  // If requestId provided, return refund details for that request instead
  if (requestId) {
    const docSnap = await adminDb.collection("requests").doc(requestId).get();
    if (!docSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Refund request not found." },
        { status: 404, headers: NO_STORE }
      );
    }
    const data = docSnap.data() ?? {};
    const preference =
      data.refundRequest?.preference ?? data.preference ?? "wallet";
    const totalRefundAmount = Number(
      data.refundRequest?.amount ?? data.amount ?? 0
    );
    const originalWalletAmount = Number(
      data.refundRequest?.walletAmount ??
        data.payment?.walletAmount ??
        data.walletAmount ??
        0
    );
    const walletRefundAmount =
      preference === "wallet"
        ? totalRefundAmount
        : ["original_sources", "original_payment"].includes(preference)
          ? originalWalletAmount
          : 0;

    /*
     * One normalized shape, versioned. The client used to walk six different
     * paths in the raw request document, so a change in that document silently
     * produced a wrong refund; the interesting numbers are resolved once, here,
     * and the client reads only this.
     */
    const refund: RefundRequestDetails = {
      id: docSnap.id,
      userId: String(data.userId ?? ""),
      preference,
      totalRefundAmount,
      walletRefundAmount,
    };

    return NextResponse.json(
      { success: true, data: { schemaVersion: REFUND_SCHEMA_VERSION, refund } },
      { status: 200, headers: NO_STORE }
    );
  }

  /*
   * One page of customers, newest first, with the wallet balance of exactly
   * those customers. This used to read every user and every wallet document on
   * every load; now the page bounds the reads on both collections, and the
   * balances arrive through chunked `in` queries because Firestore caps `in`
   * at 30 values.
   */
  let params;
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

  let usersQuery = adminDb
    .collection("users")
    .orderBy("createdAt", "desc")
    // firestore-list: pagination — cursor + hasMore per page.
    .limit(params.limit);

  if (params.cursorMs !== null) {
    usersQuery = usersQuery.startAfter(Timestamp.fromMillis(params.cursorMs));
  }

  const usersSnap = await usersQuery.get();

  const walletMap = await loadWalletBalances(usersSnap.docs.map((d) => d.id));

  const page = toAdminPage(usersSnap.docs, params.limit, (doc) => {
    const d = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      displayName: String(d.displayName || "Unnamed Customer"),
      email: String(d.email || ""),
      photoURL: d.photoURL ? String(d.photoURL) : undefined,
      role: d.role ? String(d.role) : "customer",
      walletBalance: walletMap.get(doc.id) ?? 0,
    };
  });

  const customers = page.items.filter((c) => c.role !== "admin");

  return NextResponse.json(
    {
      success: true,
      customers,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    },
    { status: 200, headers: NO_STORE }
  );
}

/** Firestore caps a single `in` at 30 values. */
const IN_QUERY_CHUNK = 30;

async function loadWalletBalances(
  userIds: string[]
): Promise<Map<string, number>> {
  const walletMap = new Map<string, number>();

  if (userIds.length === 0) return walletMap;

  const chunks: string[][] = [];
  for (let i = 0; i < userIds.length; i += IN_QUERY_CHUNK) {
    chunks.push(userIds.slice(i, i + IN_QUERY_CHUNK));
  }

  const snapshots = await Promise.all(
    chunks.map((chunk) =>
      adminDb.collection("wallets").where("__name__", "in", chunk).get()
    )
  );

  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      const bal = Number(doc.data().balance ?? 0);
      if (Number.isFinite(bal)) {
        walletMap.set(doc.id, bal);
      }
    }
  }

  return walletMap;
}

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  try {
    return await handleGetCustomers(request);
  } catch (error) {
    const authError = getAdminAuthError(error);
    if (authError.status !== 500) {
      return NextResponse.json(
        { success: false, error: authError.error },
        { status: authError.status, headers: NO_STORE }
      );
    }
    console.error("[AdminCustomers] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to load customers." },
      { status: 500, headers: NO_STORE }
    );
  }
};
