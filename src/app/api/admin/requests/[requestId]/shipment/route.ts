import { NextResponse } from "next/server";

import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

import { sendNotification } from "@/lib/notifications/notificationService";

import type { NotificationCategory } from '@/lib/notifications/notificationService';

interface RouteContext {
  params: Promise<{
    requestId: string;
  }>;
}

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    let admin;
    try {
      admin = await requireAdmin(request);
    } catch (error) {
      const authError = getAdminAuthError(error);
      return NextResponse.json(
        { error: authError.error },
        { status: authError.status }
      );
    }

    const { requestId } = await context.params;

    const body = await request.json();

    const {
      internalTrackingId,
      carrier,
      trackingNumber,
      estimatedDelivery,
      trackingUrl,
      createdAt,
    } = body;

    if (!requestId || !internalTrackingId || !carrier || !trackingNumber) {
      return NextResponse.json(
        {
          success: false,
          error: "Request ID, tracking ID, carrier, and tracking number are required.",
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

    await requestRef.update({
      tracking: {
        internalTrackingId,
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
        const customerName = requestData.customerName || requestData.shippingAddress?.firstName || "Customer";

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
            templateName: "shipin_package_shipped",
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save shipment failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unable to save shipment.",
      },
      { status: 500 }
    );
  }
}