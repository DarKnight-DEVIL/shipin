import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/utils/errors";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuthWithProfile } from "@/lib/auth";

import {
  sendNotification,
} from "@/features/notifications/services/notificationService";

const NO_STORE = { "Cache-Control": "no-store" } as const;

interface RouteContext {
  params: Promise<{
    ticketId: string;
  }>;
}

export const POST = withErrorHandler(async (
  request: NextRequest,
  context: RouteContext
) => {
  // --- 1. Authenticate the caller ---
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const { ticketId } = await context.params;

  const body = await request.json() as {
    sender?: unknown;
    message?: unknown;
  };

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
        code: "INVALID_REQUEST_BODY",
      },
      {
        status: 400,
        headers: NO_STORE,
      }
    );
  }

  // The caller may only speak as themselves: admins post as admin,
  // customers post as customer. This stops a customer impersonating
  // support inside the message stream.
  if (sender !== auth.profile.role) {
    return NextResponse.json(
      {
        success: false,
        error: "You can only send messages as your own role.",
        code: "AUTHORIZATION_ERROR",
      },
      { status: 403, headers: NO_STORE }
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
        code: "NOT_FOUND",
      },
      {
        status: 404,
        headers: NO_STORE,
      }
    );
  }

  const ticketData =
    ticketSnapshot.data() as Record<string, unknown> | undefined;

  if (!ticketData) {
    throw new Error(
      "Unable to read support ticket."
    );
  }

  // Authorization: a customer may only reply to their own tickets.
  if (
    sender === "customer" &&
    ticketData.customerId !== auth.profile.uid
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "You can only reply to your own support tickets.",
        code: "AUTHORIZATION_ERROR",
      },
      { status: 403, headers: NO_STORE }
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
          ticketData.requestId as string | undefined;

        const customerId =
          ticketData.customerId as string | undefined;

        let customerName =
          "Customer" as string;

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
              requestSnapshot.data() as Record<string, unknown> | undefined;

            const shippingAddress =
              requestData?.shippingAddress as { firstName?: string } | undefined;

            customerName =
              (typeof requestData?.customerName === "string" && requestData.customerName) ||
              (typeof shippingAddress?.firstName === "string" && shippingAddress.firstName) ||
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
              (userSnapshot.data() as Record<string, any> | undefined)
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
            ? (notificationPreferences.whatsapp.phone as string)
            : "";

        await sendNotification({
          userId: customerId ?? "",

          requestId: requestId ?? "",

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
                            (typeof ticketData.ticketNumber === "string" && ticketData.ticketNumber) ||
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

    return NextResponse.json(
      { success: true },
      { status: 200, headers: NO_STORE }
    );
  }
);