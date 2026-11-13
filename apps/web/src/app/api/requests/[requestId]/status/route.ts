import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/auth";
import { requestIdSchema, requestStatusBodySchema } from "@/lib/validation";
import { withErrorHandler } from "@/utils/errors";
import {
  ADMIN_STATUS_TRANSITIONS,
  RESERVED_STATUSES,
  canTransition,
} from "@/features/requests/services/requestWorkflow";
import { REQUEST_STATUS, type RequestStatus } from "@/features/requests/services/requestStatus";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * PATCH /api/requests/[requestId]/status
 *
 * Move a request along the operational pipeline. Admin only.
 *
 * Two things are deliberately refused:
 *
 *  - `paid` and the refund statuses, because the PayPal capture handler and
 *    the refund routes are the only places that also write the payment /
 *    refund records those statuses imply;
 *  - any transition that is not the next legal step, so a stale admin tab
 *    cannot skip inspection or resend a delivered order back to `packed`.
 *
 * Rejection is the one transition that needs a reason, which is stored on the
 * request so the customer sees why it was declined.
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

    const parsedBody = requestStatusBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsedBody.error.issues[0]?.message ?? "Invalid status.",
        },
        { status: 400, headers: NO_STORE }
      );
    }

    const nextStatus = parsedBody.data.status as RequestStatus;
    const rejectionReason = parsedBody.data.rejectionReason?.trim();

    if ((RESERVED_STATUSES as readonly string[]).includes(nextStatus)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This status is set by the payment or refund flow and cannot be applied manually.",
        },
        { status: 409, headers: NO_STORE }
      );
    }

    if (nextStatus === REQUEST_STATUS.rejected && !rejectionReason) {
      return NextResponse.json(
        { success: false, error: "A rejection reason is required." },
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
    const currentStatus = data.status as string | undefined;

    if (!currentStatus) {
      return NextResponse.json(
        { success: false, error: "This request has no status." },
        { status: 409, headers: NO_STORE }
      );
    }

    if (currentStatus === nextStatus) {
      // Idempotent: the panel may retry after a dropped response.
      return NextResponse.json(
        { success: true, status: nextStatus, unchanged: true },
        { status: 200, headers: NO_STORE }
      );
    }

    if (!canTransition(ADMIN_STATUS_TRANSITIONS, currentStatus as RequestStatus, nextStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `A request cannot move from ${currentStatus} to ${nextStatus}.`,
        },
        { status: 409, headers: NO_STORE }
      );
    }

    const updates: Record<string, unknown> = {
      status: nextStatus,
      [`statusHistory.${nextStatus}`]: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      statusUpdatedBy: admin.uid,
    };

    if (nextStatus === REQUEST_STATUS.rejected) {
      updates.rejectionReason = rejectionReason;
      updates.rejectedAt = FieldValue.serverTimestamp();
    }

    await requestRef.update(updates);

    return NextResponse.json(
      { success: true, status: nextStatus },
      { status: 200, headers: NO_STORE }
    );
  }
);
