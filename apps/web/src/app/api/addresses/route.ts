import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { requireAuthWithProfile } from "@/lib/auth";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  claimIdempotentRequest,
  readIdempotencyKey,
  rememberIdempotentResponse,
} from "@/lib/idempotency";
import { ValidationError, withErrorHandler } from "@/utils/errors";

const addressSchema = z.object({
  label: z.string().trim().max(60).optional().default(""),
  recipientName: z
    .string()
    .trim()
    .min(1, "Recipient name is required.")
    .max(120),
  phone: z.string().trim().min(3, "Phone number is required.").max(30),
  email: z.string().trim().max(255).optional(),
  country: z.string().trim().min(1, "Country is required.").max(80),
  state: z.string().trim().min(1, "State is required.").max(80),
  city: z.string().trim().min(1, "City is required.").max(80),
  postalCode: z.string().trim().min(1, "Postal code is required.").max(20),
  addressLine1: z
    .string()
    .trim()
    .min(1, "Address line 1 is required.")
    .max(200),
  addressLine2: z.string().trim().max(200).optional(),
  isDefault: z.boolean().optional().default(false),
});

/**
 * POST /api/addresses
 *
 * Saves a shipping address in the signed-in customer's address book.
 * The document path is derived from the verified token, never the body.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  const idempotencyKey = readIdempotencyKey(request);
  const replayScope = {
    uid: auth.profile.uid,
    scope: "address.create",
    key: idempotencyKey ?? "",
  };

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Invalid request body.");
  }

  const validated = addressSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError(
      validated.error.issues[0]?.message ?? "Invalid address details.",
      validated.error.issues
    );
  }

  // Claim after validation: a rejected body should not hold the key for a
  // minute, and two concurrent duplicates must not both reach the write.
  if (idempotencyKey) {
    const claim = await claimIdempotentRequest(replayScope);
    if (claim.kind === "replay") {
      return NextResponse.json(claim.response.body, {
        status: claim.response.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (claim.kind === "in_progress") {
      return NextResponse.json(
        {
          success: false,
          error: "This address is already being saved. Retry shortly.",
          code: "IDEMPOTENCY_IN_PROGRESS",
        },
        { status: 409, headers: { "Cache-Control": "no-store", "Retry-After": "1" } }
      );
    }
  }

  const addressesRef = adminDb
    .collection("users")
    .doc(auth.profile.uid)
    .collection("addresses");

  const docRef = await addressesRef.add({
      ...validated.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  if (validated.data.isDefault) {
    // A newly saved default must not leave the previous one flagged too.
    const snapshot = await addressesRef.get();
    const batch = adminDb.batch();

    snapshot.docs
      .filter((doc) => doc.id !== docRef.id)
      .forEach((doc) => {
        batch.update(doc.ref, {
          isDefault: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

    await batch.commit();
  }

  const responseBody = { success: true, addressId: docRef.id };

  if (idempotencyKey) {
    await rememberIdempotentResponse(replayScope, { status: 201, body: responseBody });
  }

  return NextResponse.json(responseBody, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
});
