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

/**
 * Retry configuration for idempotent operations.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
  /** Base delay in ms (default: 1000). */
  baseDelayMs?: number;
  /** Maximum delay in ms (default: 10000). */
  maxDelayMs?: number;
  /** Jitter factor (0-1, default: 0.3). */
  jitterFactor?: number;
  /** Predicate to determine if an error is retryable. */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Default retry configuration for PayPal API calls.
 * Only retries on network errors, timeouts, and 5xx responses.
 */
export const DEFAULT_PAYPAL_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  jitterFactor: 0.3,
  isRetryable: (error) => {
    if (error instanceof Response) {
      return error.status >= 500;
    }
    if (error instanceof Error) {
      // Network errors, timeout errors
      return (
        error.name === "TypeError" || // fetch failed (network)
        error.name === "AbortError" || // timeout
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ETIMEDOUT")
      );
    }
    return false;
  },
};

/**
 * Calculate delay with exponential backoff and jitter.
 */
function calculateDelay(attempt: number, config: Required<RetryConfig>): number {
  const exponentialDelay = config.baseDelayMs * 2 ** attempt;
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = cappedDelay * config.jitterFactor * Math.random();
  return Math.floor(cappedDelay + jitter);
}

/**
 * Fetch with retry logic for idempotent operations.
 *
 * @param url       - Destination URL.
 * @param options   - Standard RequestInit options.
 * @param config    - Retry configuration (defaults to DEFAULT_PAYPAL_RETRY_CONFIG).
 * @returns Response from the successful attempt.
 * @throws The last error if all retries are exhausted.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: RetryConfig = {}
): Promise<Response> {
  const mergedConfig: Required<RetryConfig> = {
    maxRetries: config.maxRetries ?? DEFAULT_PAYPAL_RETRY_CONFIG.maxRetries!,
    baseDelayMs: config.baseDelayMs ?? DEFAULT_PAYPAL_RETRY_CONFIG.baseDelayMs!,
    maxDelayMs: config.maxDelayMs ?? DEFAULT_PAYPAL_RETRY_CONFIG.maxDelayMs!,
    jitterFactor: config.jitterFactor ?? DEFAULT_PAYPAL_RETRY_CONFIG.jitterFactor!,
    isRetryable: config.isRetryable ?? DEFAULT_PAYPAL_RETRY_CONFIG.isRetryable!,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      
      // If response is not ok but is a retryable status, throw to trigger retry
      if (!response.ok && mergedConfig.isRetryable(response)) {
        throw response;
      }
      
      return response;
    } catch (error) {
      lastError = error;
      
      // If this was the last attempt, don't retry
      if (attempt === mergedConfig.maxRetries) {
        break;
      }
      
      // Check if error is retryable
      if (!mergedConfig.isRetryable(error)) {
        throw error;
      }
      
      // Wait before retrying
      const delay = calculateDelay(attempt, mergedConfig);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
