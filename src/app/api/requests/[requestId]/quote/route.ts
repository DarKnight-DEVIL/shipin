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

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const { requestId } =
      await context.params;

    const body =
      await request.json();

    const quote = body.quote;

    /*
     * Dates arrive from the client as ISO
     * strings because the quote is sent
     * through JSON.
     *
     * Convert them back to Date objects
     * before saving to Firestore so they
     * are stored as Firestore Timestamps.
     */
    const normalizedQuote = {
      ...quote,

      createdAt: quote?.createdAt
        ? new Date(quote.createdAt)
        : new Date(),

      expiresAt: quote?.expiresAt
        ? new Date(quote.expiresAt)
        : new Date(
            Date.now() +
              24 * 60 * 60 * 1000
          ),
    };

    if (!requestId || !quote) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Request ID and quote are required.",
        },
        {
          status: 400,
        }
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
          error:
            "Request not found.",
        },
        {
          status: 404,
        }
      );
    }

    const requestData =
      snapshot.data();

    if (!requestData) {
      throw new Error(
        "Unable to read request data."
      );
    }

    /*
     * SAVE QUOTE
     */
    await requestRef.update({
      quote: normalizedQuote,
      status: "review",
      updatedAt: new Date(),
    });

    /*
     * QUOTE READY NOTIFICATION
     *
     * Notification preferences, channel
     * settings and WhatsApp consent are
     * enforced centrally by
     * notificationService.ts.
     */
    try {
      const userId =
        requestData.userId;

      const customerName =
        requestData.customerName ||
        requestData.shippingAddress
          ?.firstName ||
        "Customer";

      await sendNotification({
        userId,

        requestId,

        title:
          "Quote Ready",

        message:
          "Your ShipIN quote is ready to review.",

        type: "quote",
        category: "quote",

        channels: {
          inApp: true,
          email: true,
          whatsapp: true,
        },

        whatsapp: {
          templateName:
            "shipin_quote_ready",

          languageCode:
            "en",

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
      });
    } catch (error) {
      console.error(
        "Quote notification failed:",
        error
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "Save quote failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Unable to save quote.",
      },
      {
        status: 500,
      }
    );
  }
}