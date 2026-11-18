/**
 * Shared PayPal vocabulary.
 *
 * `PaymentType` lived in both PayPal route files, and both re-declared the same
 * "the caller should report this status and message" shape for the steps that
 * can fail after authentication. Keeping one definition means a new step cannot
 * quietly invent a third convention.
 */

/** A PayPal checkout pays either the request's main quote or one add-on item. */
export type PaymentType = "main" | "additional_item";

/**
 * A step that failed in a way the client should be told about.
 *
 * Steps return this instead of a `NextResponse` so the money logic can be tested
 * without a request object; the route turns it into the response.
 */
export interface PaymentFailure {
  ok: false;
  status: number;
  error: string;
}
