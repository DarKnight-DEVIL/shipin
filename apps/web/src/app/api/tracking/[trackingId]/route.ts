import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/utils/errors";
import { CarrierRequestError } from "@/features/shipments/carriers";
import { resolveTracking } from "@/features/shipments/services/trackingSync";
import { authorizePublicTrackingId } from "@/lib/trackingToken";

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
 *
 * The id alone is not always enough. Modern random ids are their own secret;
 * legacy sequential ids require the signed `?token=` that
 * `createPublicTrackingUrl` adds, so a bare `SHP-YYYY-NNNNNN` no longer lets
 * anyone walk the parcel timeline. An unauthorised id answers exactly the same
 * 404 as an unknown one, so the endpoint cannot be used to probe which legacy
 * ids exist.
 */
export const GET = withErrorHandler(
  async (req: NextRequest, context: RouteContext) => {
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

    const authorizedId = authorizePublicTrackingId(
      trackingId,
      req.nextUrl.searchParams.get("token")
    );

    if (!authorizedId) {
      return NextResponse.json(
        {
          success: false,
          error: "Shipment not found.",
          code: "NOT_FOUND",
        },
        { status: 404, headers: NO_STORE }
      );
    }

    try {
      const shipment = await resolveTracking(authorizedId);

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
            error:
              "Live tracking is temporarily unavailable. Please try again shortly.",
            code: "TRACKING_UPSTREAM_ERROR",
          },
          { status: 502, headers: NO_STORE }
        );
      }

      throw error;
    }
  }
);
