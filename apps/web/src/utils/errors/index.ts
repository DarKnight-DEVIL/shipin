/**
 * Centralized error types and helpers for ShipIN.
 *
 * All application errors extend ShipINError so they can be caught
 * uniformly and serialized to clients with a consistent shape.
 */

/**
 * Factory function to create a ShipINError with explicit code and status.
 * Used when throwing new application errors (not converting existing ones).
 *
 * @example
 * throw createShipINError('Something went wrong', 'CUSTOM_CODE', 500);
 */
export function createShipINError(
  message: string,
  code: string = 'INTERNAL_ERROR',
  status: number = 500,
  details?: unknown
): ShipINError {
  return new ShipINError(message, code, status, details);
}

export class ShipINError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'INTERNAL_ERROR',
    public readonly status: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    // V8-only; harmlessly absent on other runtimes.
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor as new (...args: unknown[]) => Error);
    }
  }
}

export class ValidationError extends ShipINError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class AuthenticationError extends ShipINError {
  constructor(message: string = 'Authentication required.') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends ShipINError {
  constructor(message: string = 'Insufficient permissions.') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

export class NotFoundError extends ShipINError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found.`, 'NOT_FOUND', 404);
  }
}

export class RateLimitError extends ShipINError {
  constructor(message: string = 'Too many requests, please try again later.') {
    super(message, 'RATE_LIMIT_ERROR', 429);
  }
}

export class PaymentError extends ShipINError {
  constructor(message: string = 'Payment processing failed.') {
    super(message, 'PAYMENT_ERROR', 402);
  }
}

export class ExternalServiceError extends ShipINError {
  constructor(service: string, message?: string) {
    super(
      message || `External service ${service} is currently unavailable.`,
      'EXTERNAL_SERVICE_ERROR',
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
    if (error.message.includes('permission-denied')) {
      return new AuthorizationError('Access denied.');
    }
    if (error.message.includes('not-found')) {
      return new NotFoundError();
    }
    if (error.message.includes('unauthenticated')) {
      return new AuthenticationError();
    }
    if (error.message.includes('resource-exhausted')) {
      return new RateLimitError();
    }
    return new ShipINError(error.message, 'INTERNAL_ERROR', 500);
  }

  return new ShipINError('An unexpected error occurred.', 'INTERNAL_ERROR', 500, error);
}

/**
 * Serialize an error to a client-safe JSON shape.
 * Never leaks stack traces or internal details in production.
 */
export function serializeError(error: unknown): { error: string; code?: string; details?: unknown } {
  const err = toShipINError(error);
  const payload: { error: string; code?: string; details?: unknown } = {
    error: err.message,
    code: err.code,
  };
  if (err.details !== undefined && process.env.NODE_ENV !== 'production') {
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
    try {
      return await handler(...args);
    } catch (error) {
      const err = toShipINError(error);
      console.error('[API Error]', err.code, err.message);
      const { NextResponse } = await import('next/server');
      return NextResponse.json(serializeError(error), { status: err.status });
    }
  };
}