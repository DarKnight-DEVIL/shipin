import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification } from "@/features/notifications/services/server";
import { requireAdmin, getAdminAuthError } from "@/lib/adminAuth";
import { requestIdSchema, validateBody } from "@/lib/validation";
import { withErrorHandler } from '@/utils/errors';

const checklistSchema = z
  .object({
    packageReceived: z.boolean().nullable().optional(),
    inspectionCompleted: z.boolean().optional(),
    photosUploaded: z.boolean().optional(),
    measured: z.boolean().optional(),
    readyForShipment: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "At least one checklist field must be provided."
  );

export const PATCH = withErrorHandler(async (request: NextRequest,
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

    const validated = validateBody(body, checklistSchema);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: validated.errors[0]?.message ?? "Invalid checklist update.",
          errors: validated.errors,
        },
        { status: 400 }
      );
    }

    const payload = validated.data;
    const requestRef = adminDb.collection("requests").doc(requestId);
    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Request not found." },
        { status: 404 }
      );
    }

    const userId = snapshot.data()?.userId;
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined) return;
      updates[`warehouse.checklist.${key.toString()}`] = value;
    });

    const packageReceivedNow =
      payload.packageReceived === true &&
      (snapshot.data()?.warehouse?.checklist?.packageReceived !== true);

    await requestRef.update(updates);

    if (userId && packageReceivedNow) {
      await createNotification(
        userId,
        requestId,
        "Package Arrived",
        "Your package has been checked into our warehouse.",
        "warehouse"
      );
    }

    return NextResponse.json({ success: true }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Update warehouse checklist failed:", error);
    return NextResponse.json(
      { success: false, error: "Unable to update the checklist." },
      { status: 500 }
    );
  }
});
