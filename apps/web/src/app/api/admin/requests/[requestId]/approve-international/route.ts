import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { requestIdSchema } from "@/lib/validation";
import { withErrorHandler } from '@/utils/errors';


/**
 * POST /api/admin/requests/[requestId]/approve-international
 *
 * Move the request to `ready_for_international_shipping` after inspection +
 * customer approval (when required).
 */
export const POST = withErrorHandler(async (request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }) => {
  try {
    try {
      await requireAdmin(request);
    } catch (error) {
      const authError = getAdminAuthError(error);

      return NextResponse.json(
        { success: false, error: authError.error },
        { status: authError.status }
      );
    }

    const parsedParams = requestIdSchema.safeParse(await params);

    if (!parsedParams.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request ID." },
        { status: 400 }
      );
    }

    const { requestId } = parsedParams.data;

    const requestRef = adminDb.collection("requests").doc(requestId);
    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404 }
      );
    }

    const data = snapshot.data() ?? {};

    const status = data.status as string | undefined;

    if (status !== "warehouse_received" && status !== "ready_for_international_shipping") {
      return NextResponse.json(
        {
          success: false,
          error:
            "International shipment approval is only available after the package is received.",
        },
        { status: 409 }
      );
    }

    const shippingPreference =
      data.serviceSelections?.shippingPreference as string | undefined;

    if (
      shippingPreference === "approval" &&
      status !== "ready_for_international_shipping"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please wait for customer approval before international shipment.",
        },
        { status: 409 }
      );
    }

    const updates: Record<string, unknown> = {
      "warehouse.approvedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (status === "warehouse_received") {
      updates.status = "ready_for_international_shipping";
      updates.storage = FieldValue.serverTimestamp();
    }

    await requestRef.update(updates);

    return NextResponse.json({ success: true }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Approve international shipment failed:", error);

    return NextResponse.json(
      { success: false, error: "Unable to approve the shipment." },
      { status: 500 }
    );
  }
});
