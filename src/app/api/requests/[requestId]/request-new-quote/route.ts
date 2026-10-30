import { NextRequest, NextResponse } from "next/server";

import { requireAuthWithProfile } from "@/lib/auth";

import {
  requestIdSchema,
} from "@/lib/validation";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    /*
     * AUTHENTICATION
     */
    const auth = await requireAuthWithProfile(request);
    if (auth instanceof NextResponse) return auth;

    /*
     * VALIDATE PATH PARAM
     */
    const validatedParams =
      requestIdSchema.safeParse(await params);
    if (!validatedParams.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request ID.",
        },
        {
          status: 400,
        }
      );
    }

    const { requestId } = validatedParams.data;

    const requestRef = adminDb
      .collection("requests")
      .doc(requestId);

    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Request not found.",
        },
        {
          status: 404,
        }
      );
    }

    const requestData = snapshot.data();

    /*
     * AUTHORIZATION: only the owner may request a new quote
     */
    if (!requestData || requestData.userId !== auth.profile.uid) {
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

    await requestRef.update({
      status: "quote_requested",

      quoteRegenerationRequested: true,

      quoteRequestedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
    });

  } catch (error) {
    console.error("Request new quote failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to request a new quote.",
      },
      {
        status: 500,
      }
    );
  }
}
