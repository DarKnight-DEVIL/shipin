import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import {
  extractAuth,
  requireAuthAccount,
  requireAuthWithProfile,
  verifyIdToken,
} from "@/lib/auth";
import { verifyAppCheckRequest } from "@/lib/appCheck";
import { recordAppCheckRejection } from "@/lib/appCheckMetrics";
import { adminDb } from "@/lib/firebaseAdmin";
import { projectUserProfile } from "@/lib/userProfile";
import { ValidationError, withErrorHandler } from "@/utils/errors";

/*
 * `email` is deliberately not an input on either schema. The verified Auth
 * token is the identity of record, and firestore.rules deny the owner the
 * field for the same reason: a client-supplied copy could drift from the
 * address Firebase verified, and admin lists and notifications trust it.
 */
const createProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required.").max(100),
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

/** Firestore's ALREADY_EXISTS, as a numeric code or a string. */
function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    code === 6 || code === "already-exists" || code === "ALREADY_EXISTS"
  );
}

/**
 * GET /api/profile
 *
 * Returns only the client-safe profile projection. The browser no longer reads
 * `users/{uid}` directly: that document can still contain a legacy TOTP secret
 * until it is migrated, and firestore.rules denies the owner's direct read
 * while one is present.
 *
 * `requireAuthAccount` applies the same gate as every other authenticated
 * route (App Check, verified email, unblocked account) and migrates the legacy
 * secret before handing the document back, so nothing sensitive can reach the
 * response.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthAccount(request);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(
    {
      success: true,
      profile: auth.profile ? projectUserProfile(auth.profile) : null,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
});

/**
 * POST /api/profile
 *
 * Creates the signed-in user's profile. This is the one authenticated write
 * that runs before a profile exists and before the email is verified, so it
 * cannot use the full account gate — but it still checks App Check, and it is
 * create-only: an existing profile is answered with 409 and never rewritten.
 * Updates go through PATCH, which runs the full gate.
 *
 * `create()` rather than `set(..., { merge: true })` does two things: it makes
 * the create-only rule atomic against a concurrent request, and it stops the
 * old code from rewriting `createdAt` on every merge.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const appCheck = await verifyAppCheckRequest(request);

  if (appCheck === "missing" || appCheck === "invalid") {
    recordAppCheckRejection(appCheck);

    return NextResponse.json(
      {
        success: false,
        error: "App verification failed. Reload the page and try again.",
        code: "APP_CHECK_FAILED",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

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

  try {
    await adminDb.collection("users").doc(decoded.uid).create({
      displayName: data.displayName,
      email: decoded.email ?? "",
      phone: data.phone,
      photoURL: data.photoURL,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (isAlreadyExists(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "A profile already exists. Use PATCH to update it.",
          code: "PROFILE_EXISTS",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    throw error;
  }

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
 * Email is not writable here; the Auth token owns it.
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
