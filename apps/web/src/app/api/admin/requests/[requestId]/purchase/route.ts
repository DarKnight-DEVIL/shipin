import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/auth";
import { purchaseBodySchema, requestIdSchema } from "@/lib/validation";
import { withErrorHandler } from "@/utils/errors";
import { REQUEST_STATUS } from "@/features/requests/services/requestStatus";
import type { PurchaseVendorRecord } from "@/types/request";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** The only statuses where a purchase can be recorded. */
const PURCHASABLE_STATUSES: readonly string[] = [
  REQUEST_STATUS.paid,
  REQUEST_STATUS.purchased,
];

/**
 * PATCH /api/admin/requests/[requestId]/purchase
 *
 * Record that an admin bought the customer's items at a store. Admin only.
 *
 * - A request can be bought across several stores, so each call **appends** a
 *   vendor record instead of overwriting the last one. That preserves the full
 *   paper trail when an order is split.
 * - The first record moves the request `paid → purchased` and stamps
 *   `purchasedAt`; later records for the same request only add the vendor.
 * - `recordedAt` is a plain date rather than a server timestamp because
 *   Firestore rejects timestamp sentinels inside array elements.
 */
export const PATCH = withErrorHandler(
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

    const parsedBody = purchaseBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            parsedBody.error.issues[0]?.message ??
            "The purchase details are not valid.",
        },
        { status: 400, headers: NO_STORE }
      );
    }

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

    if (!status || !PURCHASABLE_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only a paid request can be marked as purchased. Payment must be captured first.",
        },
        { status: 409, headers: NO_STORE }
      );
    }

    const { vendor, orderNumber, amount, receiptUrl, notes } = parsedBody.data;

    /*
     * The admin and client SDKs declare separate `Timestamp` classes with the
     * same wire format (`toJSON` exists on one but not the other), so the
     * record is cast once here rather than weakening the shared Request type.
     */
    const record = {
      vendor,
      ...(orderNumber ? { orderNumber } : {}),
      amount,
      ...(receiptUrl ? { receiptUrl } : {}),
      ...(notes ? { notes } : {}),
      recordedAt: Timestamp.now(),
      recordedBy: admin.uid,
    } as unknown as PurchaseVendorRecord;

    const existing: PurchaseVendorRecord[] = Array.isArray(data.purchases)
      ? (data.purchases as PurchaseVendorRecord[])
      : [];

    const updates: Record<string, unknown> = {
      purchases: [...existing, record],
      updatedAt: FieldValue.serverTimestamp(),
      statusUpdatedBy: admin.uid,
    };

    const alreadyPurchased = status === REQUEST_STATUS.purchased;

    if (!alreadyPurchased) {
      updates.status = REQUEST_STATUS.purchased;
      updates["statusHistory.purchased"] = FieldValue.serverTimestamp();
      updates.purchasedAt = FieldValue.serverTimestamp();
    }

    await requestRef.update(updates);

    return NextResponse.json(
      {
        success: true,
        status: REQUEST_STATUS.purchased,
        addedToExistingOrder: alreadyPurchased,
        vendorCount: existing.length + 1,
      },
      { status: 200, headers: NO_STORE }
    );
  }
);
