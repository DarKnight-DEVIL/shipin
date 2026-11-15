/**
 * Idempotency keys for retryable writes.
 *
 * A key must identify one *user intent*, not one HTTP attempt: the whole point
 * is that a replay carries the same key, so the server can recognise it and
 * return the original result instead of acting twice. Callers therefore mint a
 * key when the user acts and keep it for every retry of that action.
 *
 * The format is constrained because the value ends up in a header and in a
 * Firestore document id: URL-safe characters only, bounded length.
 */

/** Keys the server accepts: 8–128 URL-safe characters. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Mint a key for one user action.
 *
 * `crypto.randomUUID()` is available in every browser this app supports and in
 * Node 19+; the random-hex fallback keeps older test environments working
 * without pulling in a dependency.
 */
export function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
