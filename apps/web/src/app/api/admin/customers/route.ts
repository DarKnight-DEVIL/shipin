import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { getAdminAuthError, requireAdmin } from "@/lib/adminAuth";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export interface AdminCustomer {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role?: string;
  walletBalance: number;
}

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
      data.refundRequest?.preference ??
      data.preference ??
      "wallet";
    const totalRefundAmount = Number(
      data.refundRequest?.amount ?? data.amount ?? 0
    );
    const originalWalletAmount = Number(
      data.refundRequest?.walletAmount ??
        data.payment?.walletAmount ??
        data.walletAmount ??
        0
    );
    const _walletRefundAmount =
      preference === "wallet"
        ? totalRefundAmount
        : ["original_sources", "original_payment"].includes(preference)
          ? originalWalletAmount
          : 0;

    return NextResponse.json(
      { success: true, data: { id: docSnap.id, ...data } satisfies Record<string, unknown> },
      { status: 200, headers: NO_STORE }
    );
  }

  const [usersSnap, walletsSnap] = await Promise.all([
    adminDb.collection("users").get(),
    adminDb.collection("wallets").get(),
  ]);

  const walletMap = new Map<string, number>();
  for (const doc of walletsSnap.docs) {
    const bal = Number(doc.data().balance ?? 0);
    if (Number.isFinite(bal)) {
      walletMap.set(doc.id, bal);
    }
  }

  const customers: AdminCustomer[] = usersSnap.docs
    .map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        displayName: String(d.displayName || "Unnamed Customer"),
        email: String(d.email || ""),
        photoURL: d.photoURL ? String(d.photoURL) : undefined,
        role: d.role ? String(d.role) : "customer",
        walletBalance: walletMap.get(doc.id) ?? 0,
      };
    })
    .filter((c) => c.role !== "admin");

  return NextResponse.json({ success: true, customers }, { status: 200, headers: NO_STORE });
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
