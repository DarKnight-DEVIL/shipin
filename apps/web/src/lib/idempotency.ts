/**
 * Server-side idempotency for money-moving writes — SERVER ONLY.
 *
 * `apiFetch` replays a write only when the caller supplied an idempotency key.
 * That is safe exactly when the route honours the key: a replay has to return
 * the first attempt's result instead of performing the write again. This module
 * is that half of the contract.
 *
 * The store is `idempotencyKeys/{sha256(uid:scope:key)}`, holding the response
 * status and body. Keys are scoped per user, so one customer cannot replay
 * another's response by guessing a key, and per route (`scope`), so the same
 * key on two endpoints cannot collide.
 *
 * Failure policy is deliberately fail-open *for the write*: if the store is
 * unreachable, the request proceeds. Every route that uses this also has a
 * stronger guarantee in its own transaction (wallet payment refuses a request
 * that is already paid), so the idempotency record improves the response the
 * client sees — it is not the only thing standing between a retry and a double
 * charge.
 */

import "server-only";

import crypto from "crypto";

import { adminDb } from "@/lib/firebaseAdmin";

export const IDEMPOTENCY_HEADER = "idempotency-key";

/** How long a completed response can be replayed. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const COLLECTION = "idempotencyKeys";

export interface IdempotentResponse {
  status: number;
  body: unknown;
}

/**
 * The key on this request, or null.
 *
 * An absent or malformed key means "not idempotent": the caller must not retry,
 * and nothing is recorded. Silently ignoring a malformed key is safer than
 * rejecting the write, which would turn a header typo into a failed payment.
 */
export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get(IDEMPOTENCY_HEADER)?.trim();

  if (!raw) return null;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(raw)) return null;

  return raw;
}

function documentId(uid: string, scope: string, key: string): string {
  return crypto
    .createHash("sha256")
    .update(`${uid}:${scope}:${key}`, "utf8")
    .digest("hex");
}

/**
 * The response recorded for this key, or null when there is none (or the record
 * has expired). Never throws: a store failure must not block a real payment.
 */
export async function readIdempotentResponse({
  uid,
  scope,
  key,
}: {
  uid: string;
  scope: string;
  key: string;
}): Promise<IdempotentResponse | null> {
  try {
    const snapshot = await adminDb
      .collection(COLLECTION)
      .doc(documentId(uid, scope, key))
      .get();

    if (!snapshot.exists) return null;

    const data = snapshot.data() as
      | { status?: unknown; body?: unknown; expiresAt?: unknown }
      | undefined;

    const expiresAt = Number(data?.expiresAt);

    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    if (typeof data?.status !== "number") return null;

    return { status: data.status, body: data.body };
  } catch (error) {
    console.error("[idempotency] Could not read the stored response:", error);
    return null;
  }
}

/**
 * Record a completed response for replay. Best-effort: a failure is logged and
 * the caller still returns its response, because the write already happened.
 */
export async function rememberIdempotentResponse(
  {
    uid,
    scope,
    key,
  }: {
    uid: string;
    scope: string;
    key: string;
  },
  response: IdempotentResponse
): Promise<void> {
  try {
    await adminDb
      .collection(COLLECTION)
      .doc(documentId(uid, scope, key))
      .set({
        uid,
        scope,
        status: response.status,
        body: response.body,
        createdAt: Date.now(),
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
  } catch (error) {
    console.error("[idempotency] Could not store the response:", error);
  }
}
