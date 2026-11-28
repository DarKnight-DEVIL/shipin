/**
 * Centralized error types and helpers for ShipIN.
 *
 * All application errors extend ShipINError so they can be caught
 * uniformly and serialized to clients with a consistent shape.
 */

import { NextResponse } from "next/server";
import { reportHandledError } from "@/lib/errorReporterHook";
import { runScoped } from "@/lib/requestScope";

/**
 * Factory function to create a ShipINError with explicit code and status.
 * Used when throwing new application errors (not converting existing ones).
 *
 * @example
 * throw createShipINError('Something went wrong', 'CUSTOM_CODE', 500);
 */
export function createShipINError(
  message: string,
  code: string = "INTERNAL_ERROR",
  status: number = 500,
  details?: unknown
): ShipINError {
  return new ShipINError(message, code, status, details);
}

export class ShipINError extends Error {
  constructor(
    message: string,
    public readonly code: string = "INTERNAL_ERROR",
    public readonly status: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    // V8-only; harmlessly absent on other runtimes.
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(
        this,
        this.constructor as new (...args: unknown[]) => Error
      );
    }
  }
}

export class ValidationError extends ShipINError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", 400, details);
  }
}

export class AuthenticationError extends ShipINError {
  constructor(message: string = "Authentication required.") {
    super(message, "AUTHENTICATION_ERROR", 401);
  }
}

export class AuthorizationError extends ShipINError {
  constructor(message: string = "Insufficient permissions.") {
    super(message, "AUTHORIZATION_ERROR", 403);
  }
}

export class NotFoundError extends ShipINError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found.`, "NOT_FOUND", 404);
  }
}

export class RateLimitError extends ShipINError {
  constructor(message: string = "Too many requests, please try again later.") {
    super(message, "RATE_LIMIT_ERROR", 429);
  }
}

export class PaymentError extends ShipINError {
  constructor(message: string = "Payment processing failed.") {
    super(message, "PAYMENT_ERROR", 402);
  }
}

export class ExternalServiceError extends ShipINError {
  constructor(service: string, message?: string) {
    super(
      message || `External service ${service} is currently unavailable.`,
      "EXTERNAL_SERVICE_ERROR",
      502
    );
  }
}

/**
 * Convert any thrown value into a ShipINError.
 * Preserves known error types; wraps unknown values.
 */
export function toShipINError(error: unknown): ShipINError {
  if (error instanceof ShipINError) return error;

  if (error instanceof Error) {
    // Map common Firebase / Firestore errors
    if (error.message.includes("permission-denied")) {
      return new AuthorizationError("Access denied.");
    }
    if (error.message.includes("not-found")) {
      return new NotFoundError();
    }
    if (error.message.includes("unauthenticated")) {
      return new AuthenticationError();
    }
    if (error.message.includes("resource-exhausted")) {
      return new RateLimitError();
    }
    return new ShipINError(error.message, "INTERNAL_ERROR", 500);
  }

  return new ShipINError(
    "An unexpected error occurred.",
    "INTERNAL_ERROR",
    500,
    error
  );
}

/**
 * The message every unexpected failure reports to a client.
 *
 * Only errors that were deliberately constructed with a client-facing message
 * (4xx application errors, or a non-generic code) keep their text. A raw
 * `Error` from Firestore, PayPal, or a bug carries provider internals and
 * stack-adjacent detail; it goes to the server log and the client gets this.
 */
const GENERIC_SERVER_ERROR = "An unexpected error occurred.";

/**
 * Serialize an error to a client-safe JSON shape.
 * Never leaks stack traces or internal details in production.
 */
export function serializeError(error: unknown): {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
} {
  const err = toShipINError(error);

  /*
   * An internal failure is logged with its real message before the generic one
   * replaces it: whoever debugs the 500 needs the detail the client must not
   * see. `withErrorHandler` logs the same line, so errors that pass through it
   * are not logged twice.
   */
  const isInternal =
    err.code === "INTERNAL_ERROR" || err.status >= 500;
  if (isInternal) {
    console.error("[API Error detail]", err.code, error);
  }

  // `success: false` is part of the documented envelope
  // (response-convention.md) and what the API clients branch on
  // (`apiClient`: `!response.ok || payload.success === false`). Without it an
  // error body had no discriminator at all, so a caller reading only the JSON
  // — the refund smoke test did — could not tell a rejection from a result.
  const payload: {
    success: false;
    error: string;
    code?: string;
    details?: unknown;
  } = {
    success: false,
    error: isInternal ? GENERIC_SERVER_ERROR : err.message,
    code: err.code,
  };
  if (err.details !== undefined && process.env.NODE_ENV !== "production") {
    payload.details = err.details;
  }
  return payload;
}

/**
 * Wrap an async API handler with automatic error serialization.
 *
 * @example
 * export const POST = withErrorHandler(async (request) => {
 *   const body = await parseBody(request, schema);
 *   const result = await myService.execute(body);
 *   return NextResponse.json(result);
 * });
 */
export function withErrorHandler<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    // Open the request scope here, at the one seam every API route passes
    // through: the logger below reads the id from it, so a failure four call
    // frames deep is still correlatable to the request that caused it. The
    // header is the proxy's; the platform's own id is the fallback. The runner
    // is injected (see `requestScope.ts`) so this file stays client-safe.
    const requestId = requestIdOf(args[0]);

    return runScoped({ requestId }, async () => {
      try {
        return await handler(...args);
      } catch (error) {
        const err = toShipINError(error);

        // One structured event per unhandled failure, deduplicated by fingerprint:
        // the same broken route alerts once per window instead of once per request.
        reportHandledError(error, {
          category: "unhandled",
          severity: err.status >= 500 ? "error" : "warning",
          code: err.code,
          context: { status: err.status },
        });

        return NextResponse.json(serializeError(error), { status: err.status });
      }
    });
  };
}

/**
 * A request id this app is willing to put in a log line.
 *
 * The proxy overwrites the header with its own `crypto.randomUUID()`, so a
 * caller's value normally never reaches here. This is the second gate: the
 * reader is called directly by tests and by any future entry point, and an
 * unbounded, unvalidated string in a log field is both noise and a way to forge
 * correlation.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The request id a handler's first argument carries, if any.
 *
 * Handlers run with `()` in tests and with a `NextRequest` in production, so
 * this stays defensive rather than assuming a Request.
 */
function requestIdOf(candidate: unknown): string | undefined {
  if (!candidate || typeof candidate !== "object") return undefined;

  const headers = (candidate as { headers?: { get?: (name: string) => string | null } })
    .headers;

  if (!headers || typeof headers.get !== "function") return undefined;

  const raw = headers.get("x-request-id")?.trim();

  return raw && REQUEST_ID_PATTERN.test(raw) ? raw : undefined;
}
