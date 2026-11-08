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
};

export async function customerApi<T>(
  path: string,
  { method = "GET", body }: CustomerApiOptions = {}
): Promise<T> {
  return apiFetch<T>(path, {
    method,
    body,
    errorClass: CustomerApiError,
  });
}
