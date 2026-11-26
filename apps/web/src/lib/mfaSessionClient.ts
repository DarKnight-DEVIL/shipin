/**
 * Client-side helpers for the admin MFA session.
 *
 * The session itself lives in an HttpOnly cookie, so nothing is stored in
 * localStorage. This module only talks to /api/auth/mfa/session.
 */

import { mfaApi } from "@/lib/mfaApi";
import type { MfaMethod } from "@/lib/mfaProof";

export interface MfaSessionStatus {
  elevated: boolean;
  expiresAt: number | null;
  methods: MfaMethod[];
  sessionTtlMs: number;
}

const SESSION_PATH = "/api/auth/mfa/session";

type SessionResponse = {
  elevated?: unknown;
  expiresAt?: unknown;
  methods?: unknown;
  method?: unknown;
  sessionTtlMs?: unknown;
};

/** Whether the current admin holds an elevated session. */
export async function getMfaSessionStatus(
  idToken: string
): Promise<MfaSessionStatus> {
  const body = await mfaApi<SessionResponse>(SESSION_PATH, { idToken });

  return {
    elevated: Boolean(body.elevated),
    expiresAt: typeof body.expiresAt === "number" ? body.expiresAt : null,
    methods: Array.isArray(body.methods) ? (body.methods as MfaMethod[]) : [],
    sessionTtlMs: typeof body.sessionTtlMs === "number" ? body.sessionTtlMs : 0,
  };
}

/** Exchange an MFA code for an elevated session. */
export async function startMfaSession(
  idToken: string,
  method: MfaMethod,
  code: string
): Promise<{ expiresAt: number | null; method: MfaMethod }> {
  const body = await mfaApi<SessionResponse>(SESSION_PATH, {
    idToken,
    method: "POST",
    body: { method, code },
  });

  return {
    expiresAt: typeof body.expiresAt === "number" ? body.expiresAt : null,
    method: (body.method as MfaMethod) || method,
  };
}

/**
 * End the elevated session (call on admin sign-out).
 *
 * The route requires the caller's ID token, so pass one obtained *before*
 * `signOut()`. Sign-out must not fail because this did, hence the swallow: a
 * leftover cookie expires on its own, whereas a stuck sign-out leaves the user
 * signed in with no way out.
 */
export async function endMfaSession(idToken: string): Promise<void> {
  try {
    await mfaApi(SESSION_PATH, { idToken, method: "DELETE" });
  } catch {
    // See above: an elevation that outlives this call is still bounded by its
    // own 30-minute lifetime.
  }
}
