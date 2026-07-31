import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";

interface RouteContext {
  params: Promise<{
    trackingId: string;
  }>;
}

export async function GET(
  req: Request,
  context: RouteContext
) {
  try {
    const { trackingId } =
      await context.params;

    if (!trackingId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Tracking ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const normalizedTrackingId =
      decodeURIComponent(
        trackingId
      )
        .trim()
        .toUpperCase();

    const snapshot =
      await adminDb
        .collection("requests")
        .where(
          "tracking.internalTrackingId",
          "==",
          normalizedTrackingId
        )
        .limit(1)
        .get();

    if (snapshot.empty) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Shipment not found.",
        },
        {
          status: 404,
        }
      );
    }

    const requestDoc =
      snapshot.docs[0];

    const data =
      requestDoc.data();

    /*
     * IMPORTANT:
     *
     * Return ONLY information that
     * customers are allowed to see.
     *
     * Do NOT return:
     *
     * tracking.trackingNumber
     * tracking.carrier
     * tracking.trackingUrl
     */
    return NextResponse.json({
      success: true,

      shipment: {
        trackingId:
          data.tracking
            ?.internalTrackingId,

        status:
          data.status,

        estimatedDelivery:
          data.tracking
            ?.estimatedDelivery ??
          null,

        createdAt:
          data.tracking
            ?.createdAt
            ?.toDate?.()
            ?.toISOString() ??
          null,

        statusHistory:
          serializeStatusHistory(
            data.statusHistory
          ),
      },
    });
  } catch (error) {
    console.error(
      "Tracking lookup error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to retrieve shipment.",
      },
      {
        status: 500,
      }
    );
  }
}

function serializeStatusHistory(
  history: Record<
    string,
    any
  > = {}
) {
  const result: Record<
    string,
    string | null
  > = {};

  for (const [
    key,
    value,
  ] of Object.entries(history)) {
    result[key] =
      value?.toDate?.()
        ?.toISOString() ??
      null;
  }

  return result;
}