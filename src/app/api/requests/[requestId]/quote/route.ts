import { NextResponse } from "next/server";

import { requireAuthWithProfile } from "@/lib/auth";

import {
  requestIdSchema,
  validateBody,
  idSchema,
} from "@/lib/validation";

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
    /*
     * AUTHENTICATION + OWNERSHIP
     *
     * The caller must be authenticated and must own
     * the request being updated.
     */
    const auth = await requireAuthWithProfile(request);
    if (auth instanceof NextResponse) return auth;

    const { requestId } =
      await context.params;

    const body =
      await request.json();

    const quote = body.quote;
    const quoteRegenerationRequested =
      body.quoteRegenerationRequested;

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
     * AUTHORIZATION: only the owner may save a quote
     */
    if (requestData.userId !== auth.profile.uid) {
      return NextResponse.json(
        {
          success: false,
          error:
            "You do not have permission to update this request.",
        },
        {
          status: 403,
        }
      );
    }

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

    /*
     * SAVE QUOTE
     */
    await requestRef.update({
      quote: {
        ...normalizedQuote,

        expired: false,

        regeneratedCount:
          (requestData.quote?.regeneratedCount ?? 0) + 1,
      },

      status: "review",

      quoteRegenerationRequested:
        quoteRegenerationRequested ?? false,

      quoteRequestedAt: null,

      updatedAt: new Date(),
    });

    /*
     * QUOTE READY NOTIFICATION
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

        title: requestData.quoteRegenerationRequested
          ? "Updated Quote Ready"
          : "Quote Ready",

        message: requestData.quoteRegenerationRequested
          ? "Your updated quotation is ready for review and payment."
          : "Your ShipIN quote is ready to review.",

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
          "Unable to save quote.",
      },
      {
        status: 500,
      }
    );
  }
}
