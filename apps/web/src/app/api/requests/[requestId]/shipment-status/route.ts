import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/auth";
import { requestIdSchema, shipmentStatusBodySchema } from "@/lib/validation";
import { withErrorHandler } from "@/utils/errors";
import {
  SHIPMENT_STATUS_TRANSITIONS,
  canTransition,
} from "@/features/requests/services/requestWorkflow";
import type { RequestStatus } from "@/features/requests/services/requestStatus";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * PATCH /api/requests/[requestId]/shipment-status
 *
 * Advance the customer-visible shipment progress: packed → shipped →
 * out_for_delivery → delivered. Admin only.
 *
 * Kept separate from the general status endpoint because these transitions are
 * what the public tracking page reads, so they may only move forward one step
 * at a time and cannot drag a request back out of a terminal state.
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

    const parsedBody = shipmentStatusBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            parsedBody.error.issues[0]?.message ?? "Invalid shipment status.",
        },
        { status: 400, headers: NO_STORE }
      );
    }

    const nextStatus = parsedBody.data.status as RequestStatus;

    const requestRef = adminDb.collection("requests").doc(requestId);
    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404, headers: NO_STORE }
      );
    }

    const data = snapshot.data() ?? {};
    const currentStatus = data.status as string | undefined;

    if (!currentStatus) {
      return NextResponse.json(
        { success: false, error: "This request has no status." },
        { status: 409, headers: NO_STORE }
      );
    }

    if (currentStatus === nextStatus) {
      return NextResponse.json(
        { success: true, status: nextStatus, unchanged: true },
        { status: 200, headers: NO_STORE }
      );
    }

    if (
      !canTransition(
        SHIPMENT_STATUS_TRANSITIONS,
        currentStatus as RequestStatus,
        nextStatus
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Shipment progress cannot move from ${currentStatus} to ${nextStatus}.`,
        },
        { status: 409, headers: NO_STORE }
      );
    }

    await requestRef.update({
      status: nextStatus,
      [`statusHistory.${nextStatus}`]: FieldValue.serverTimestamp(),
      [`tracking.${nextStatus}At`]: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      statusUpdatedBy: admin.uid,
    });

    return NextResponse.json(
      { success: true, status: nextStatus },
      { status: 200, headers: NO_STORE }
    );
  }
);
