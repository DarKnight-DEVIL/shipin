/**
 * Server-side idempotency for money-moving writes — SERVER ONLY.
 *
 * `apiFetch` replays a write only when the caller supplied an idempotency key.
 * That is safe exactly when the route honours the key: a replay has to return
 * the first attempt's result instead of performing the write again. This module
 * is that half of the contract.
 *
 * The store is Redis when a shared store is configured (a single round trip,
 * and the same answer from every instance), and Redis is the only store: the
 * record carries its own `expiresAt` and a TTL on the key, so there is no
 * second copy to keep in sync. Keys are scoped per user, so one customer
 * cannot replay another's response by guessing a key, and per route (`scope`),
 * so the same key on two endpoints cannot collide.
 *
 * Failure policy is deliberately fail-open *for the write*: if the store is
 * unreachable, the request proceeds and no record is kept. Every route that
 * uses this also has a stronger guarantee in its own transaction (wallet
 * payment refuses a request that is already paid), so the idempotency record
 * improves the response the client sees — it is not the only thing standing
 * between a retry and a double charge.
 */

import "server-only";

import crypto from "crypto";

import { Redis } from "@upstash/redis";

import { serverEnv } from "@/config/env";

export const IDEMPOTENCY_HEADER = "idempotency-key";

/** How long a completed response can be replayed. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const REDIS_PREFIX = "shipin:idempotency:";

let redisClient: Redis | null | undefined;

/** The shared store, or null when it is not configured. */
function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = serverEnv.UPSTASH_REDIS_REST_URL;
  const token = serverEnv.UPSTASH_REDIS_REST_TOKEN;

  let valid = false;
  if (url) {
    try {
      valid = new URL(url).protocol === "https:";
    } catch {
      valid = false;
    }
  }

  redisClient =
    valid && token ? new Redis({ url: url as string, token }) : null;
  return redisClient;
}

function redisKey(uid: string, scope: string, key: string): string {
  return `${REDIS_PREFIX}${documentId(uid, scope, key)}`;
}
export interface IdempotentResponse {
  status: number;
  body: unknown;
  /** Set when reading from the shared store; absent on a freshly built record. */
  expiresAt?: number;
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
  const redis = getRedis();

  if (redis) {
    try {
      const stored = await redis.get<IdempotentResponse | string>(
        redisKey(uid, scope, key),
      );
      const parsed =
        typeof stored === "string"
          ? (JSON.parse(stored) as IdempotentResponse)
          : stored;

      if (
        parsed &&
        typeof parsed.status === "number" &&
        typeof parsed.expiresAt === "number" &&
        parsed.expiresAt > Date.now()
      ) {
        return { status: parsed.status, body: parsed.body };
      }
      if (parsed) return null;
    } catch (error) {
      // A read failure only costs this request its replay: the route's own
      // transaction still refuses a duplicate write.
      console.error("[idempotency] Could not read the shared store:", error);
    }
  }

  // No fallback store: with Redis unconfigured or unreachable there is no
  // record to replay, so the caller proceeds without one.
  return null;
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
  response: IdempotentResponse,
): Promise<void> {
  const record = {
    uid,
    scope,
    status: response.status,
    body: response.body,
    createdAt: Date.now(),
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  };

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(redisKey(uid, scope, key), JSON.stringify(record), {
        ex: Math.floor(IDEMPOTENCY_TTL_MS / 1000),
      });
    } catch (error) {
      console.error(
        "[idempotency] Could not store the response in the shared store:",
        error,
      );
    }
  }
}
