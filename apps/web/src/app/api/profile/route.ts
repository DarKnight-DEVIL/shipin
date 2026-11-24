import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { extractAuth, requireAuthWithProfile, verifyIdToken } from "@/lib/auth";
import { adminDb } from "@/lib/firebaseAdmin";
import { ValidationError, withErrorHandler } from "@/utils/errors";

const profileEmailSchema = z
  .string()
  .trim()
  .max(255)
  .refine(
    (value) => value === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    "Invalid email address."
  );

const createProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required.").max(100),
  email: profileEmailSchema.optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  photoURL: z.string().trim().max(2048).optional().default(""),
});

const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(100)
    .optional(),
  email: profileEmailSchema.optional(),
  phone: z.string().trim().max(30).optional(),
  photoURL: z.string().trim().max(2048).optional(),
  // Stored as an ISO date (YYYY-MM-DD): the age gate parses it with
  // calculateAge, and a date-only value leaks nothing about the time of birth.
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be a valid date.")
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value &&
        parsed.getTime() <= Date.now()
      );
    }, "Date of birth must be a valid date.")
    .optional(),
});

function parseJsonBody<T>(body: unknown, schema: z.ZodType<T>): T {
  const validated = schema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError(
      validated.error.issues[0]?.message ?? "Invalid profile details.",
      validated.error.issues
    );
  }

  return validated.data;
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: message, code: "VALIDATION_ERROR" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * POST /api/profile
 *
 * Creates (or merges) the signed-in user's profile. This route verifies the ID
 * token but does not require a verified email or an existing profile, because
 * it runs immediately after sign-up and during first-time profile repair.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const token = extractAuth(request);

  if (!token) return badRequest("Authentication required.");

  const decoded = await verifyIdToken(token);

  if (!decoded) return badRequest("Invalid authentication token.");

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Invalid request body.");
  }

  const data = parseJsonBody(body, createProfileSchema);

  await adminDb
    .collection("users")
    .doc(decoded.uid)
    .set(
      {
        displayName: data.displayName,
        email: decoded.email ?? data.email,
        phone: data.phone,
        photoURL: data.photoURL,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return NextResponse.json(
    { success: true },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
});

/**
 * PATCH /api/profile
 *
 * Updates the signed-in user's display name, contact number, photo, or date
 * of birth (which drives the DPDP age gate and the parental-consent flow).
 */
export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithProfile(request);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Invalid request body.");
  }

  const data = parseJsonBody(body, updateProfileSchema);

  if (Object.keys(data).length === 0) {
    throw new ValidationError("No profile changes were provided.");
  }

  await adminDb
    .collection("users")
    .doc(auth.profile.uid)
    .update({
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    });

  return NextResponse.json(
    { success: true },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
});
