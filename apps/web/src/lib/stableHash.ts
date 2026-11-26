/**
 * A small, dependency-free hash for building stable keys.
 *
 * Two places need one - the error fingerprint and the identity cache key - and
 * both were using `node:crypto`. That import is fatal in this app: `proxy.ts` and
 * `instrumentation.ts` are compiled for the edge runtime as well as Node, and a
 * `crypto` import anywhere in their graph stops the production build. The
 * fingerprint is a bucketing key, not a security primitive, so a non-cryptographic
 * hash is the right tool anyway.
 *
 * FNV-1a, 64-bit via two 32-bit lanes, rendered as 16 hex characters. Stable
 * across processes, which is what a deduplication key needs.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function stableHash(input: string): string {
  let low = FNV_OFFSET;
  let high = FNV_OFFSET ^ 0x5bf03635;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);

    low ^= code;
    low = Math.imul(low, FNV_PRIME) >>> 0;

    high ^= code + index;
    high = Math.imul(high, FNV_PRIME) >>> 0;
  }

  return (
    low.toString(16).padStart(8, "0") + high.toString(16).padStart(8, "0")
  );
}
