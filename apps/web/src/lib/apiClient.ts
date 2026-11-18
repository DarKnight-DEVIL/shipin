/**
 * @fileoverview Shared API client factory for authenticated fetch calls.
 *
 * Both customer and admin clients share ~90% of their logic. This module
 * centralizes the common behavior (token attachment, error normalization,
 * network-error handling) so each variant only differs in its error class
 * and any extra headers it attaches.
 */

import { clearAppCheckFailure, notifyAppCheckFailure } from "@/lib/appCheckFailure";
import { HTTP_TIMEOUT_MS } from "@/config/constants";
import { beginRetryNotice, endRetryNotice } from "@/lib/requestRetry";
import { auth, getAppCheckToken } from "@/lib/firebase";

export interface ApiErrorOptions {
  message: string;
  code: string;
  status: number;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export interface ApiErrorClass {
  new (message: string, code: string, status: number): ApiError;
}

export type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  extraHeaders?: Record<string, string>;
  errorClass?: ApiErrorClass;
  /**
   * Marks this write as safe to replay.
   *
   * Only pass one when the route honours `Idempotency-Key` (wallet payments,
   * refund initiation): a replay must return the first attempt's result rather
   * than performing the write again. Mint it once per user action with
   * `newIdempotencyKey()` and reuse it for every retry of that action.
   */
  idempotencyKey?: string;
};

function createError(
  errorClass: ApiErrorClass,
  message: string,
  code: string,
  status: number
): ApiError {
   
  return new errorClass(message, code, status);
}

/**
 * A user whose profile document was never created (every Google sign-in before
 * the repair existed) gets 403 USER_PROFILE_NOT_FOUND from every route that
 * calls `requireAuthWithProfile`. The client creates it once, then retries.
 *
 * The repair is a plain fetch rather than a call back into this module, so the
 * retry path cannot recurse.
 */
const PROFILE_REPAIR_PATH = "/api/profile";
const PROFILE_MISSING_CODE = "USER_PROFILE_NOT_FOUND";
const EMAIL_VERIFICATION_CODE = "EMAIL_VERIFICATION_REQUIRED";

/**
 * Rejected attestation. Every page would otherwise toast this as a generic
 * failure, so it is also published to the retry banner.
 */
const APP_CHECK_FAILED_CODE = "APP_CHECK_FAILED";

/**
 * Statuses worth replaying once.
 *
 * 502/503/504 mean a gateway or upstream gave up before the handler ran, which
 * is the classic transient failure on Vercel. A 500 is deliberately excluded:
 * the handler ran and threw, so a replay would repeat the same bug.
 */
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

/** Base backoff for the single retry. */
const RETRY_DELAY_MS = 300;

/** Cap so an upstream `Retry-After: 300` cannot stall the page for minutes. */
const MAX_RETRY_DELAY_MS = 2000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Backoff for a retry, honouring `Retry-After` when the server sends one.
 * Only the delta-seconds form is handled; an HTTP-date would need clock
 * arithmetic for no real benefit here.
 */
function retryDelay(response: Response): number {
  const header = response.headers.get("retry-after");
  if (!header) return RETRY_DELAY_MS;

  const seconds = Number.parseInt(header, 10);
  if (!Number.isFinite(seconds) || seconds < 0) return RETRY_DELAY_MS;

  return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
}

interface ProfileRepairUser {
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

let profileRepairInFlight: Promise<boolean> | null = null;

/** Create the missing profile document. Resolves false instead of throwing. */
async function repairMissingProfile(user: ProfileRepairUser): Promise<boolean> {
  if (profileRepairInFlight) return profileRepairInFlight;

  const pending = (async () => {
    try {
      const token = await user.getIdToken();
      const response = await fetch(PROFILE_REPAIR_PATH, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName:
            user.displayName?.trim() ||
            user.email?.split("@")[0] ||
            "ShipIN customer",
          email: user.email ?? "",
          phone: "",
          photoURL: user.photoURL ?? "",
        }),
        credentials: "same-origin",
        cache: "no-store",
      });
      return response.ok;
    } catch {
      return false;
    }
  })();

  profileRepairInFlight = pending;

  try {
    return await pending;
  } finally {
    profileRepairInFlight = null;
  }
}

/**
 * Force a new ID token and return it, or null when the refresh fails.
 *
 * A token minted before the user clicked the verification link keeps claiming
 * `email_verified: false` until it expires (up to an hour), so `requireAuth`
 * rejects every request with EMAIL_VERIFICATION_REQUIRED even though the
 * account is verified.
 */
async function refreshIdToken(user: ProfileRepairUser): Promise<string | null> {
  try {
    return await user.getIdToken(true);
  } catch {
    return null;
  }
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function apiFetch<T>(
  path: string,
  {
    method = "GET",
    body,
    extraHeaders = {},
    errorClass = ApiError,
    idempotencyKey,
  }: ApiOptions = {}
): Promise<T> {
  const user = auth.currentUser;

  if (!user) {
    throw createError(errorClass, "You are signed out. Sign in again.", "AUTHENTICATION_REQUIRED", 401);
  }

  let idToken = await user.getIdToken();

  // Our route handlers use the Admin SDK, which bypasses Firebase's App Check
  // enforcement, so the token has to be presented explicitly. Null whenever App
  // Check is not configured, in which case no header is sent at all.
  // `let`: a rejected attestation is retried once with a freshly minted token.
  const appCheckToken = await getAppCheckToken();
  let appCheckHeaders: Record<string, string> = appCheckToken
    ? { "X-Firebase-AppCheck": appCheckToken }
    : {};

  // Without a deadline a stalled upstream leaves the tab waiting forever, and
  // a serverless invocation billable for its whole duration.
  const send = () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    return fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...appCheckHeaders,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  };

  const networkError = () =>
    createError(errorClass, "Could not reach the server.", "NETWORK_ERROR", 0);

  // GET is always replayable. A write is replayable only when the caller
  // supplied an idempotency key, which promises the route will return the first
  // attempt's result instead of acting again — without one, a retried POST
  // could charge a card or create a refund twice.
  const isIdempotent = method === "GET" || Boolean(idempotencyKey);

  let response: Response;

  try {
    response = await send();
  } catch {
    if (!isIdempotent) throw networkError();

    // Published so the page can say it is retrying: the backoff is invisible
    // otherwise, and a slow one reads as a frozen screen.
    beginRetryNotice();
    await wait(RETRY_DELAY_MS);
    try {
      response = await send();
    } catch {
      throw networkError();
    } finally {
      endRetryNotice();
    }
  }

  let payload = await readPayload(response);

  // One retry, then stop: a second transient failure means the caller should
  // see the error rather than wait through a longer backoff.
  if (isIdempotent && RETRYABLE_STATUSES.has(response.status)) {
    beginRetryNotice();
    await wait(retryDelay(response));
    try {
      response = await send();
    } catch {
      throw networkError();
    } finally {
      endRetryNotice();
    }
    payload = await readPayload(response);
  }

  // One recovery attempt, then one retry. Deliberately not a loop: the same
  // error coming back means the recovery did not take effect, and the caller
  // should see the real error rather than an endless retry.
  if (!response.ok) {
    let recovered = false;

    if (payload.code === PROFILE_MISSING_CODE) {
      recovered = await repairMissingProfile(user);
    } else if (payload.code === EMAIL_VERIFICATION_CODE) {
      const refreshed = await refreshIdToken(user);
      if (refreshed) {
        idToken = refreshed;
        recovered = true;
      }
    } else if (payload.code === APP_CHECK_FAILED_CODE) {
      // A cached token can go stale in a long-lived tab (expired, or minted
      // before the device's attestation changed), and the rejection means the
      // handler never ran, so replaying is free of side effects — unlike the
      // status-code retries, this one needs no idempotency key.
      const refreshedToken = await getAppCheckToken(true);
      if (refreshedToken) {
        appCheckHeaders = { "X-Firebase-AppCheck": refreshedToken };
        recovered = true;
      }
    }

    if (recovered) {
      try {
        response = await send();
      } catch {
        throw createError(errorClass, "Could not reach the server.", "NETWORK_ERROR", 0);
      }
      payload = await readPayload(response);
    }
  }

  if (!response.ok || payload.success === false) {
    const code =
      typeof payload.code === "string" ? payload.code : "UNKNOWN_ERROR";

    // Only the banner is special-cased; the caller still gets the error, so
    // existing page-level handling keeps working. By the time this runs the
    // force-refreshed retry above has already failed, so the banner appears only
    // when a new token could not fix it — not on the first transient rejection.
    if (code === APP_CHECK_FAILED_CODE) notifyAppCheckFailure();

    throw createError(
      errorClass,
      typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status}).`,
      code,
      response.status
    );
  }

  clearAppCheckFailure();

  return payload as T;
}