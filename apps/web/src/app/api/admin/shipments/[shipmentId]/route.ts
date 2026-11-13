import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { withErrorHandler } from '@/utils/errors';

/**
 * PATCH /api/admin/shipments/[shipmentId]
 *
 * Update the courier, tracking number, and package dimensions of a shipment.
 * Admin-only; the caller must hold an elevated MFA session.
 *
 * Only the fields present in the body are written, so a partial edit cannot
 * blank out values the client did not send.
 */

type ShipmentUpdate = {
  courier?: string;
  tracking?: string;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
};

function readDimension(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("INVALID_DIMENSION");
  }

  return parsed;
}

export const PATCH = withErrorHandler(async (request: NextRequest,
  { params }: { params: Promise<{ shipmentId: string }> }) => {
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

    const { shipmentId } = await params;

    if (!shipmentId) {
      return NextResponse.json(
        { success: false, error: "Shipment ID is required." },
        { status: 400 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body." },
        { status: 400 }
      );
    }

    const payload = (body ?? {}) as ShipmentUpdate;

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (typeof payload.courier === "string") {
      update.courier = payload.courier.trim();
    }

    if (typeof payload.tracking === "string") {
      update.tracking = payload.tracking.trim();
    }

    try {
      for (const field of ["weight", "length", "width", "height"] as const) {
        const dimension = readDimension(payload[field]);

        if (dimension !== undefined) {
          update[field] = dimension;
        }
      }
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Weight and dimensions must be non-negative numbers.",
        },
        { status: 400 }
      );
    }

    if (Object.keys(update).length === 1) {
      return NextResponse.json(
        { success: false, error: "No shipment fields were provided." },
        { status: 400 }
      );
    }

    const shipmentRef = adminDb.collection("shipments").doc(shipmentId);
    const snapshot = await shipmentRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Shipment not found." },
        { status: 404 }
      );
    }

    await shipmentRef.update(update);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update shipment failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update shipment.",
      },
      { status: 500 }
    );
  }
});
