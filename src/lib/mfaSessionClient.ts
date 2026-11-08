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
 * Elevate using a WebAuthn assertion.
 *
 * The assertion must come from `assertSecurityKey()` in the same ceremony:
 * the server verifies the signature against the challenge it issued.
 */
export async function startWebAuthnSession(
  idToken: string,
  credential: unknown
): Promise<{ expiresAt: number | null; method: MfaMethod }> {
  const body = await mfaApi<SessionResponse>(SESSION_PATH, {
    idToken,
    method: "POST",
    body: { method: "webauthn", credential },
  });

  return {
    expiresAt: typeof body.expiresAt === "number" ? body.expiresAt : null,
    method: "webauthn",
  };
}

/** End the elevated session (call on admin sign-out). */
export async function endMfaSession(): Promise<void> {
  try {
    await fetch(SESSION_PATH, {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    // Clearing an elevation is best-effort; the cookie expires on its own.
  }
}
