/**
 * Client for authenticated admin API calls.
 *
 * Admin routes require both a Firebase ID token (proving who you are) and, for
 * write routes, an elevated MFA session (proving a second factor). This helper
 * attaches the token and normalizes errors so callers cannot forget the header
 * — which is exactly how the shipment panel silently 401'd before.
 * Built on the shared `apiFetch` factory in `@/lib/apiClient`.
 */

import { ApiError, apiFetch } from "./apiClient";

export class AdminApiError extends ApiError {
  constructor(message: string, code: string, status = 0) {
    super(message, code, status);
    this.name = "AdminApiError";
  }
}

type AdminApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
};

export async function adminApi<T>(
  path: string,
  { method = "GET", body }: AdminApiOptions = {}
): Promise<T> {
  return apiFetch<T>(path, {
    method,
    body,
    errorClass: AdminApiError,
  });
}
