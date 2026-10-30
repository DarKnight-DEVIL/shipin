/**
 * Authentication helpers for ShipIN API routes.
 */

import { NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getAdminAuthError, type AdminUser } from "./adminAuth";

export function extractAuth(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Verify a Firebase ID token. Invalid tokens return null rather than throwing. */
export async function verifyIdToken(token: string): Promise<DecodedIdToken | null> {
  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    return null;
  }
}

/**
 * Require any authenticated user. A valid Firebase token is sufficient even
 * when the user profile has not been created yet.
 */
export async function requireAuth(
  request: Request
): Promise<DecodedIdToken | NextResponse> {
  const token = extractAuth(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const decoded = await verifyIdToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid authentication token." }, { status: 401 });
  }

  return decoded;
}

export async function requireAuthWithProfile(
  request: Request,
  allowedRoles?: Array<"admin" | "customer">
): Promise<
  | { token: DecodedIdToken; profile: { uid: string; role?: string } }
  | NextResponse
> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const userSnapshot = await adminDb.collection("users").doc(auth.uid).get();
    if (!userSnapshot.exists) {
      return NextResponse.json({ error: "User profile not found." }, { status: 403 });
    }

    const profile = userSnapshot.data() ?? {};
    const role =
      profile.role === "admin" || profile.role === "customer"
        ? profile.role
        : undefined;
    if (allowedRoles && !allowedRoles.includes(role ?? "customer")) {
      return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
    }

    return { token: auth, profile: { uid: auth.uid, role } };
  } catch {
    return NextResponse.json({ error: "Unable to verify user profile." }, { status: 500 });
  }
}

export async function requireAdmin(
  request: Request
): Promise<AdminUser | NextResponse> {
  try {
    const adminAuthModule = await import("@/lib/adminAuth");
    return await adminAuthModule.requireAdmin(request);
  } catch (error) {
    const authError = getAdminAuthError(error);
    return NextResponse.json({ error: authError.error }, { status: authError.status });
  }
}

export function handleAuthError(error: unknown): {
  status: number;
  body: { error: string };
} {
  const authError = getAdminAuthError(error);
  return { status: authError.status, body: { error: authError.error } };
}
