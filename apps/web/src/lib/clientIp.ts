/**
 * Client address used by rate limiting and by audit records (consent log).
 *
 * Only a header the deployment platform sanitises may be trusted. This app is
 * deployed on Vercel, which overwrites `x-forwarded-for` and also sets
 * `x-vercel-forwarded-for` and `x-real-ip`, so a browser cannot forge any of
 * them.
 *
 * `cf-connecting-ip` is deliberately NOT trusted: Vercel neither sets nor
 * strips it, so a client could send its own value with every request and mint a
 * fresh rate-limit bucket each time — which is exactly the bypass this module
 * exists to close. A deployment genuinely proxied by Cloudflare would read
 * `cf-connecting-ip` instead, and must then guarantee the origin is unreachable
 * except through Cloudflare.
 *
 * The generic `x-forwarded-for` fallback takes the LAST hop: the leftmost value
 * is whatever the client claimed, while the rightmost was appended by the
 * nearest proxy.
 */

/** First comma-separated address, trimmed; `null` when absent or empty. */
function firstAddress(header: string | null): string | null {
  if (!header) return null;
  const value = header.split(",")[0]?.trim();
  return value ? value : null;
}

/** Last non-empty comma-separated address; `null` when absent or empty. */
function lastAddress(header: string | null): string | null {
  if (!header) return null;
  const parts = header
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts[parts.length - 1]! : null;
}

/**
 * The client address this request should be attributed to, or `null` when the
 * request carries no address the platform vouches for. Callers choose their own
 * fallback (a shared bucket for rate limiting, `"unknown"` for an audit log).
 */
export function getClientIp(request: Request): string | null {
  const platformForwarded = firstAddress(
    request.headers.get("x-vercel-forwarded-for")
  );
  if (platformForwarded) return platformForwarded;

  const realIp = firstAddress(request.headers.get("x-real-ip"));
  if (realIp) return realIp;

  return lastAddress(request.headers.get("x-forwarded-for"));
}
