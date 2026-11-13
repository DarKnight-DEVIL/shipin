import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { createNotification } from "@/features/notifications/services/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { requestIdSchema, validateBody } from "@/lib/validation";
import { withErrorHandler } from '@/utils/errors';

const inspectionSchema = z.object({
  weight: z.number().finite().min(0),
  length: z.number().finite().min(0),
  width: z.number().finite().min(0),
  height: z.number().finite().min(0),
  condition: z
    .enum(["Excellent", "Good", "Damaged", "Unacceptable"])
    .default("Good"),
});

export const PUT = withErrorHandler(async (request: NextRequest,
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

    const validated = validateBody(body, inspectionSchema);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: validated.errors[0]?.message ?? "Invalid inspection data.",
          errors: validated.errors,
        },
        { status: 400 }
      );
    }

    const { weight, length, width, height, condition } = validated.data;

    const requestRef = adminDb.collection("requests").doc(requestId);
    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404 }
      );
    }

    const userId = snapshot.data()?.userId;
    const inspectionCompletedAt = FieldValue.serverTimestamp();

    const updates: Record<string, unknown> = {
      "warehouse.weight": weight,
      "warehouse.length": length,
      "warehouse.width": width,
      "warehouse.height": height,
      "warehouse.condition": condition,
      "warehouse.inspectionCompletedAt": inspectionCompletedAt,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await requestRef.update(updates);

    if (userId) {
      await createNotification(
        userId,
        requestId,
        "Inspection Complete",
        "Your warehouse inspection is now available.",
        "inspection"
      );
    }

    return NextResponse.json({ success: true }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Save warehouse inspection failed:", error);

    return NextResponse.json(
      { success: false, error: "Unable to save the inspection." },
      { status: 500 }
    );
  }
});
