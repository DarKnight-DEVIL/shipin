/**
 * Shared outbound HTTP helpers — SERVER ONLY.
 *
 * Centralizes the fetch-with-timeout pattern that was previously
 * duplicated in paypal.ts and whatsapp.ts. Timeouts come from
 * @/config/constants so they can be tuned in one place.
 */

import { HTTP_TIMEOUT_MS } from "@/config/constants";

/**
 * Fetch a URL with an abort timeout.
 *
 * @param url       - Destination URL.
 * @param options   - Standard RequestInit options.
 * @param timeoutMs - Optional per-call timeout override (defaults to HTTP_TIMEOUT_MS).
 */
export function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = HTTP_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timeout)
  );
}