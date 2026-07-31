import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebaseAdmin";

import {
  sendNotification,
} from "@/lib/notifications/notificationService";

interface RouteContext {
  params: Promise<{
    requestId: string;
  }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const { requestId } =
      await context.params;

    const body =
      await request.json();

    const status =
      typeof body.status === "string"
        ? body.status.trim()
        : "";

    if (!requestId || !status) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Request ID and status are required.",
        },
        { status: 400 }
      );
    }

    const requestRef =
      adminDb
        .collection("requests")
        .doc(requestId);

    const snapshot =
      await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Request not found.",
        },
        { status: 404 }
      );
    }

    const requestData =
      snapshot.data();

    if (!requestData) {
      throw new Error(
        "Unable to read request data."
      );
    }

    await requestRef.update({
      status,

      [`statusHistory.${status}`]:
        new Date(),

      updatedAt:
        new Date(),
    });

    const userId =
      requestData.userId;

    const customerName =
      requestData.customerName ||
      requestData.shippingAddress
        ?.firstName ||
      "Customer";

    const trackingId =
      requestData.tracking
        ?.internalTrackingId;

    /*
     * Load notification preferences once.
     */
    let notificationPreferences:
      | Record<string, any>
      | undefined;

    if (userId) {
      try {
        const userSnapshot =
          await adminDb
            .collection("users")
            .doc(userId)
            .get();

        notificationPreferences =
          userSnapshot.data()
            ?.preferences
            ?.notifications;
      } catch (error) {
        /*
         * Preference lookup failure must
         * never stop shipment processing.
         */
        console.error(
          "Unable to load notification preferences:",
          error
        );
      }
    }

    const whatsappPhone =
      notificationPreferences
        ?.channels
        ?.whatsapp === true &&
      notificationPreferences
        ?.whatsapp
        ?.consentedAt &&
      notificationPreferences
        ?.whatsapp
        ?.phone
        ? notificationPreferences
            .whatsapp
            .phone
        : "";

    /*
     * PACKAGE SHIPPED
     */
    if (status === "shipped") {
      const shippingEnabled =
        notificationPreferences
          ?.categories
          ?.shipping !== false;

      await sendNotification({
        userId,

        requestId,

        title:
          "Package Shipped",

        message:
          "Your package has left the warehouse.",

        type: "shipping",
        category: "shipping",

        channels: {
          inApp: true,
          email: true,

          whatsapp: Boolean(
            shippingEnabled &&
            whatsappPhone &&
            trackingId
          ),
        },

        ...(shippingEnabled &&
        whatsappPhone &&
        trackingId
          ? {
              whatsapp: {

                templateName:
                  "shipin_package_shipped",

                languageCode: "en",

                components: [
                  {
                    type: "body",

                    parameters: [
                      {
                        type: "text",
                        text: customerName,
                      },
                      {
                        type: "text",
                        text: trackingId,
                      },
                    ],
                  },
                ],
              },
            }
          : {}),
      });
    }

    /*
     * OUT FOR DELIVERY
     */
    if (
      status ===
      "out_for_delivery"
    ) {
      const deliveryEnabled =
        notificationPreferences
          ?.categories
          ?.delivery !== false;

      await sendNotification({
        userId,

        requestId,

        title:
          "Out For Delivery",

        message:
          "Your package is out for delivery and should reach you soon.",

        type: "delivery",
        category: "delivery",

        channels: {
          inApp: true,
          email: true,

          whatsapp: Boolean(
            deliveryEnabled &&
            whatsappPhone &&
            trackingId
          ),
        },

        ...(deliveryEnabled &&
        whatsappPhone &&
        trackingId
          ? {
              whatsapp: {

                templateName:
                  "shipin_out_for_delivery",

                languageCode: "en",

                components: [
                  {
                    type: "body",

                    parameters: [
                      {
                        type: "text",
                        text: customerName,
                      },
                      {
                        type: "text",
                        text: trackingId,
                      },
                    ],
                  },
                ],
              },
            }
          : {}),
      });
    }

    /*
     * PACKAGE DELIVERED
     */
    if (status === "delivered") {
      const deliveryEnabled =
        notificationPreferences
          ?.categories
          ?.delivery !== false;

      await sendNotification({
        userId,

        requestId,

        title:
          "Package Delivered",

        message:
          "Your package has been delivered successfully.",

        type: "delivery",
        category: "delivery",

        channels: {
          inApp: true,
          email: true,

          whatsapp: Boolean(
            deliveryEnabled &&
            whatsappPhone &&
            trackingId
          ),
        },

        ...(deliveryEnabled &&
        whatsappPhone &&
        trackingId
          ? {
              whatsapp: {

                templateName:
                  "shipin_package_delivered",

                languageCode: "en",

                components: [
                  {
                    type: "body",

                    parameters: [
                      {
                        type: "text",
                        text: customerName,
                      },
                      {
                        type: "text",
                        text: trackingId,
                      },
                    ],
                  },
                ],
              },
            }
          : {}),
      });
    }

    /*
     * PACKAGE RECEIVED AT WAREHOUSE
     */
    if (status === "warehouse_received") {
      const warehouseEnabled =
        notificationPreferences
          ?.categories
          ?.warehouse !== false;

      await sendNotification({
        userId,

        requestId,

        title:
          "Package Received at Warehouse",

        message:
          "Your package has arrived at the ShipIN warehouse.",

        type: "warehouse",
        category: "warehouse",

        channels: {
          inApp: true,
          email: true,

          whatsapp: Boolean(
            warehouseEnabled &&
            whatsappPhone
          ),
        },

        ...(warehouseEnabled &&
        whatsappPhone
          ? {
              whatsapp: {

                templateName:
                  "shipin_warehouse_received",

                languageCode: "en",

                components: [
                  {
                    type: "body",

                    parameters: [
                      {
                        type: "text",
                        text: customerName,
                      },
                      {
                        type: "text",
                        text: requestId,
                      },
                    ],
                  },
                ],
              },
            }
          : {}),
      });
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "Shipment status update failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Unable to update shipment status.",
      },
      {
        status: 500,
      }
    );
  }
}