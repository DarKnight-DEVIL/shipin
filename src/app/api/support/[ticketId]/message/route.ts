import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";

import {
  sendNotification,
} from "@/lib/notifications/notificationService";

interface RouteContext {
  params: Promise<{
    ticketId: string;
  }>;
}

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const { ticketId } =
      await context.params;

    const body =
      await request.json();

    const sender =
      body.sender === "admin"
        ? "admin"
        : body.sender === "customer"
          ? "customer"
          : "";

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (
      !ticketId ||
      !sender ||
      !message
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Ticket ID, sender and message are required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * LOAD SUPPORT TICKET
     */
    const ticketRef =
      adminDb
        .collection("supportTickets")
        .doc(ticketId);

    const ticketSnapshot =
      await ticketRef.get();

    if (!ticketSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Support ticket not found.",
        },
        {
          status: 404,
        }
      );
    }

    const ticketData =
      ticketSnapshot.data();

    if (!ticketData) {
      throw new Error(
        "Unable to read support ticket."
      );
    }

    /*
     * SAVE MESSAGE
     */
    await adminDb
      .collection("supportMessages")
      .add({
        ticketId,
        sender,
        message,

        createdAt:
          FieldValue.serverTimestamp(),
      });

    /*
     * UPDATE UNREAD STATE
     *
     * This preserves the same behaviour
     * as sendSupportMessage() in firestore.ts.
     */
    await ticketRef.update({
      updatedAt:
        FieldValue.serverTimestamp(),

      adminUnread:
        sender === "customer",

      customerUnread:
        sender === "admin",
    });

    /*
     * Only an ADMIN reply should notify
     * the customer externally.
     */
    if (sender === "admin") {
      try {
        const requestId =
          ticketData.requestId;

        const customerId =
          ticketData.customerId;

        let customerName =
          "Customer";

        /*
         * Get request/customer information.
         */
        if (requestId) {
          try {
            const requestSnapshot =
              await adminDb
                .collection("requests")
                .doc(requestId)
                .get();

            const requestData =
              requestSnapshot.data();

            customerName =
              requestData
                ?.customerName ||
              requestData
                ?.shippingAddress
                ?.firstName ||
              "Customer";
          } catch (error) {
            console.error(
              "Unable to load request for support notification:",
              error
            );
          }
        }

        let notificationPreferences:
          | Record<string, any>
          | undefined;

        if (customerId) {
          try {
            const userSnapshot =
              await adminDb
                .collection("users")
                .doc(customerId)
                .get();

            notificationPreferences =
              userSnapshot.data()
                ?.preferences
                ?.notifications;
          } catch (error) {
            console.error(
              "Unable to load support notification preferences:",
              error
            );
          }
        }

        const supportEnabled =
          notificationPreferences
            ?.categories
            ?.support !== false;

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

        await sendNotification({
          userId: customerId,

          requestId,

          title:
            "Support Update",

          message:
            "ShipIN Support has replied to your ticket.",

          type: "support",
          category: "support",

          channels: {
            inApp: true,

            email: true,

            whatsapp: Boolean(
              supportEnabled &&
              whatsappPhone
            ),
          },

          ...(supportEnabled &&
          whatsappPhone
            ? {
                whatsapp: {

                  templateName:
                    "shipin_support_update",

                  languageCode:
                    "en",

                  components: [
                    {
                      type: "body",

                      parameters: [
                        {
                          type: "text",
                          text:
                            customerName,
                        },
                        {
                          type: "text",
                          text:
                            ticketData
                              .ticketNumber ||
                            ticketId,
                        },
                      ],
                    },
                  ],
                },
              }
            : {}),
        });
      } catch (error) {
        /*
         * Support message has already
         * been successfully saved.
         *
         * Notification failure must not
         * make the reply fail.
         */
        console.error(
          "Support notification failed:",
          error
        );
      }
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "Send support message failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Unable to send support message.",
      },
      {
        status: 500,
      }
    );
  }
}