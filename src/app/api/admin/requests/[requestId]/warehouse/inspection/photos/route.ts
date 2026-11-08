import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { requestIdSchema, validateBody } from "@/lib/validation";
import { withErrorHandler } from '@/utils/errors';

const photoSchema = z.object({
  id: z.string().uuid("Photo ID must be a UUID."),
  url: z.string().trim().min(1, "Photo URL is required."),
  caption: z.string().trim().max(200).optional(),
});

export const POST = withErrorHandler(async (request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }) => {
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

    const parsedParams = requestIdSchema.safeParse(await params);

    if (!parsedParams.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request ID." },
        { status: 400 }
      );
    }

    const { requestId } = parsedParams.data;

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body." },
        { status: 400 }
      );
    }

    const validated = validateBody(body, photoSchema);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: validated.errors[0]?.message ?? "Invalid photo data.",
          errors: validated.errors,
        },
        { status: 400 }
      );
    }

    const { id, url, caption = "" } = validated.data;

    const requestRef = adminDb.collection("requests").doc(requestId);
    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404 }
      );
    }

    const updates = {
      "warehouse.inspectionPhotos": FieldValue.arrayUnion({
        id,
        url,
        caption,
        uploadedAt: FieldValue.serverTimestamp(),
      }),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await requestRef.update(updates);

    return NextResponse.json(
      {
        success: true,
        photoId: id,
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Upload inspection photo failed:", error);

    return NextResponse.json(
      { success: false, error: "Unable to upload the photo." },
      { status: 500 }
    );
  }
});
