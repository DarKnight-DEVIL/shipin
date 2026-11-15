/**
 * Client for authenticated customer API calls.
 *
 * Customer routes authenticate a plain Firebase ID token — no admin role and no
 * MFA elevation — so this helper only has to attach the token and normalize
 * errors. Built on the shared `apiFetch` factory in `@/lib/apiClient`.
 */

import { ApiError, apiFetch } from "@/lib/apiClient";

export class CustomerApiError extends ApiError {
  constructor(message: string, code: string, status = 0) {
    super(message, code, status);
    this.name = "CustomerApiError";
  }
}

type CustomerApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Pass `newIdempotencyKey()` for writes the route deduplicates. */
  idempotencyKey?: string;
};

export async function customerApi<T>(
  path: string,
  { method = "GET", body, idempotencyKey }: CustomerApiOptions = {}
): Promise<T> {
  return apiFetch<T>(path, {
    method,
    body,
    idempotencyKey,
    errorClass: CustomerApiError,
  });
}
