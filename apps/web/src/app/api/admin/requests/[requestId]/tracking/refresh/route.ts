import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/auth";
import { requestIdSchema } from "@/lib/validation";
import { withErrorHandler } from "@/utils/errors";
import {
  CarrierNotConfiguredError,
  CarrierRequestError,
} from "@/features/shipments/carriers";
import { resolveTracking } from "@/features/shipments/services/trackingSync";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/admin/requests/[requestId]/tracking/refresh
 *
 * Force one carrier pull for a request, bypassing the cache window and the
 * "stop when delivered" rule. Admin only.
 *
 * This exists because a delivered parcel can still gain late scans (customs
 * reversals, a corrected delivery date), and support needs an answer without
 * waiting out the cache or editing Firestore by hand. The forced pull writes
 * the same deduped history as the automatic one, so refreshing repeatedly
 * cannot grow the document.
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

    const snapshot = await adminDb.collection("requests").doc(requestId).get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404, headers: NO_STORE }
      );
    }

    const data = snapshot.data() ?? {};
    const tracking =
      typeof data.tracking === "object" && data.tracking !== null
        ? (data.tracking as Record<string, unknown>)
        : {};

    const trackingId =
      (typeof tracking.internalTrackingId === "string" &&
        tracking.internalTrackingId) ||
      "";

    if (!trackingId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This request has no ShipIN tracking number yet. Create the shipment first.",
        },
        { status: 409, headers: NO_STORE }
      );
    }

    if (
      typeof tracking.trackingNumber !== "string" ||
      tracking.trackingNumber.trim() === ""
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "No carrier consignment number is recorded for this request.",
        },
        { status: 409, headers: NO_STORE }
      );
    }

    try {
      const shipment = await resolveTracking(trackingId, { force: true });

      return NextResponse.json(
        { success: true, shipment, refreshedBy: admin.uid },
        { status: 200, headers: NO_STORE }
      );
    } catch (error) {
      if (error instanceof CarrierNotConfiguredError) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Carrier tracking is not configured. Set the India Post credentials to pull live scans.",
          },
          { status: 503, headers: NO_STORE }
        );
      }

      if (error instanceof CarrierRequestError) {
        console.error("Carrier tracking refresh failed:", error.message);

        return NextResponse.json(
          {
            success: false,
            error: "The carrier did not return tracking data. Try again shortly.",
          },
          { status: 502, headers: NO_STORE }
        );
      }

      throw error;
    }
  }
);
