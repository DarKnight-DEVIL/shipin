import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/utils/errors";
import { CarrierRequestError } from "@/features/shipments/carriers";
import { resolveTracking } from "@/features/shipments/services/trackingSync";

const NO_STORE = { "Cache-Control": "no-store" } as const;

interface RouteContext {
  params: Promise<{ trackingId: string }> | { trackingId: string };
}

/**
 * GET /api/tracking/:trackingId
 *
 * Public, unauthenticated lookup by the ShipIN number the customer was given.
 * The carrier consignment number never appears in the response, and neither do
 * any of the carrier's charges — `resolveTracking` builds the payload field by
 * field and caches the result, so a customer refreshing the page costs one
 * upstream call per TRACKING_CACHE_TTL_MS at most.
 */
export const GET = withErrorHandler(
  async (_req: NextRequest, context: RouteContext) => {
    const { trackingId } = await context.params;

    if (!trackingId) {
      return NextResponse.json(
        {
          success: false,
          error: "Tracking ID is required.",
          code: "INVALID_REQUEST",
        },
        { status: 400, headers: NO_STORE }
      );
    }

    try {
      const shipment = await resolveTracking(trackingId);

      if (!shipment) {
        return NextResponse.json(
          {
            success: false,
            error: "Shipment not found.",
            code: "NOT_FOUND",
          },
          { status: 404, headers: NO_STORE }
        );
      }

      return NextResponse.json(
        { success: true, shipment },
        { status: 200, headers: NO_STORE }
      );
    } catch (error) {
      if (error instanceof CarrierRequestError) {
        console.error("Carrier tracking failed:", error.message);

        return NextResponse.json(
          {
            success: false,
            error: "Live tracking is temporarily unavailable. Please try again shortly.",
            code: "TRACKING_UPSTREAM_ERROR",
          },
          { status: 502, headers: NO_STORE }
        );
      }

      throw error;
    }
  }
);

export const POST = withErrorHandler(async (_req: NextRequest) => {
  return NextResponse.json(
    { error: "not implemented" },
    { status: 501 }
  );
});
