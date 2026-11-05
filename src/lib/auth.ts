/**
 * Authentication helpers for ShipIN API routes.
 *
 * Uses centralized error handling via @/utils/errors for consistent
 * error responses across all API endpoints.
 */

import { NextResponse } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { getAdminAuthError, type AdminUser } from './adminAuth';
import { toShipINError, serializeError } from '@/utils/errors';

export function extractAuth(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Verify a Firebase ID token. Invalid tokens return null rather than throwing. */
export async function verifyIdToken(token: string): Promise<DecodedIdToken | null> {
  try {
    return await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    return null;
  }
}

/**
 * Require any authenticated user with a verified email.
 *
 * Email verification is enforced server-side (#4) so that even if a client
 * bypasses the UI redirect, API routes reject unverified tokens.
 */
export async function requireAuth(
  request: Request
): Promise<DecodedIdToken | NextResponse> {
  const token = extractAuth(request);
  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 }
    );
  }

  const decoded = await verifyIdToken(token);
  if (!decoded) {
    return NextResponse.json(
      { error: 'Invalid authentication token.' },
      { status: 401 }
    );
  }

  // Enforce email verification on all authenticated API access.
  if (decoded.email_verified !== true) {
    return NextResponse.json(
      { error: 'Please verify your email address before accessing this resource.' },
      { status: 403 }
    );
  }

  return decoded;
}

export async function requireAuthWithProfile(
  request: Request,
  allowedRoles?: Array<'admin' | 'customer'>
): Promise<
  | { token: DecodedIdToken; profile: { uid: string; role?: string } }
  | NextResponse
> {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const userSnapshot = await adminDb.collection('users').doc(auth.uid).get();
    if (!userSnapshot.exists) {
      return NextResponse.json(
        { error: 'User profile not found.' },
        { status: 403 }
      );
    }

    const profile = userSnapshot.data() ?? {};
    const role =
      profile.role === 'admin' || profile.role === 'customer'
        ? profile.role
        : undefined;
    if (allowedRoles && !allowedRoles.includes(role ?? 'customer')) {
      return NextResponse.json(
        { error: 'Insufficient permissions.' },
        { status: 403 }
      );
    }

    return { token: auth, profile: { uid: auth.uid, role } };
  } catch (error) {
    console.error('[Auth] Profile verification failed:', error);
    return NextResponse.json(
      { error: 'Unable to verify user profile.' },
      { status: 500 }
    );
  }
}

export async function requireAdmin(
  request: Request
): Promise<AdminUser | NextResponse> {
  try {
    const adminAuthModule = await import('./adminAuth');
    return await adminAuthModule.requireAdmin(request);
  } catch (error) {
    const authError = getAdminAuthError(error);
    return NextResponse.json(
      { error: authError.error },
      { status: authError.status }
    );
  }
}

export function handleAuthError(error: unknown): {
  status: number;
  body: { error: string };
} {
  const authError = getAdminAuthError(error);
  return { status: authError.status, body: { error: authError.error } };
}

/**
 * Wrap an auth handler with centralized error handling.
 */
export function withAuthHandler<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T
): (...args: Parameters<T>) => Promise<NextResponse> {
  return async (...args: Parameters<T>): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      const err = toShipINError(error);
      console.error('[Auth API Error]', err.code, err.message);
      return NextResponse.json(serializeError(error), { status: err.status });
    }
  };
}
