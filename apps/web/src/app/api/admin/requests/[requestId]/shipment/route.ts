import { NextResponse } from "next/server";

import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

import { sendNotification } from "@/features/notifications/services/notificationService";
import { WHATSAPP_TEMPLATES } from "@/features/notifications/templates";
import type { NotificationCategory } from "@/features/notifications/services/notificationService";
import { withErrorHandler } from "@/utils/errors";
import { readAndValidateBody, shipmentBodySchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{
    requestId: string;
  }>;
}

/**
 * Mint the next ShipIN tracking ID.
 *
 * Runs here rather than in the admin panel so the counter is written by the
 * Admin SDK: `counters/{id}` is closed to clients, and a missing ID must not
 * depend on the browser having generated one.
 */
async function generateTrackingId(): Promise<string> {
  const counterRef = adminDb.collection("counters").doc("tracking");

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(counterRef);
    const next = (snapshot.data()?.value ?? 0) + 1;

    transaction.set(
      counterRef,
      { value: next, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return `SHP-${new Date().getFullYear()}-${String(next).padStart(6, "0")}`;
  });
}

export const POST = withErrorHandler(
  async (request: Request, context: RouteContext) => {
    try {
      await requireAdmin(request);
    } catch (error) {
      const authError = getAdminAuthError(error);
      return NextResponse.json(
        { error: authError.error },
        { status: authError.status }
      );
    }

    const { requestId } = await context.params;

    const parsed = await readAndValidateBody(request, shipmentBodySchema);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Request ID, carrier, and tracking number are required.",
        },
        { status: 400 }
      );
    }

    const {
      internalTrackingId,
      carrier,
      trackingNumber,
      estimatedDelivery,
      trackingUrl,
      createdAt,
    } = parsed.data;

    if (!requestId) {
      return NextResponse.json(
        {
          success: false,
          error: "Request ID, carrier, and tracking number are required.",
        },
        { status: 400 }
      );
    }

    const requestRef = adminDb.collection("requests").doc(requestId);

    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Request not found.",
        },
        { status: 404 }
      );
    }

    const requestData = snapshot.data();

    if (!requestData) {
      throw new Error("Unable to read request data.");
    }

    // Keep the ID an edit already recorded; mint one only for a first shipment.
    const trackingId = internalTrackingId || (await generateTrackingId());

    await requestRef.update({
      tracking: {
        internalTrackingId: trackingId,
        carrier,
        trackingNumber: trackingNumber.trim(),
        estimatedDelivery: estimatedDelivery ?? null,
        trackingUrl: trackingUrl ?? "",
        createdAt: createdAt ?? FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Send notification if status is packed (will be moved to shipped)
    if (requestData.status === "packed") {
      try {
        const userId = requestData.userId;
        const customerName =
          requestData.customerName ||
          requestData.shippingAddress?.firstName ||
          "Customer";

        await sendNotification({
          userId,
          requestId,
          title: "Package Shipped",
          message: `Your package has been shipped with ${carrier}. Tracking: ${trackingNumber}`,
          type: "shipped",
          category: "shipment" as NotificationCategory,
          channels: {
            inApp: true,
            email: true,
            whatsapp: true,
          },
          whatsapp: {
            templateName: WHATSAPP_TEMPLATES.packageShipped,
            languageCode: "en",
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: customerName },
                  { type: "text", text: trackingNumber },
                  { type: "text", text: carrier },
                ],
              },
            ],
          },
        });
      } catch (error) {
        console.error("Shipment notification failed:", error);
      }
    }

    return NextResponse.json({ success: true, trackingId });
  }
);
