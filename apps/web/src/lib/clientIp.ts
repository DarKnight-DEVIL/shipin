/**
 * Client address used by rate limiting and by audit records (consent log).
 *
 * A forwarded-address header is only trustworthy when something in front of the
 * app sanitises it. On a direct-to-node deployment (`next start`, the Docker
 * image published without a reverse proxy) every hop is client-supplied, so a
 * browser can send `x-forwarded-for` itself and mint a fresh rate-limit bucket
 * per request. The headers are therefore read only in a deployment that has
 * declared its trust boundary:
 *
 * - `VERCEL=1`: the platform overwrites `x-forwarded-for` and also sets
 *   `x-vercel-forwarded-for` and `x-real-ip`, so all three may be read. That
 *   variable is set by Vercel itself, not by this project.
 * - `TRUST_PROXY=1`: set this only when a reverse proxy (nginx, a load
 *   balancer, Cloudflare) is the sole path to the app and sanitises the chain.
 *   Then the last hop of `x-forwarded-for` and `x-real-ip` are read.
 *
 * With neither set, `getClientIp` returns `null` and callers use their own
 * fallback — a shared rate-limit bucket or `"unknown"` in an audit record.
 *
 * `cf-connecting-ip` is deliberately NOT trusted even behind Cloudflare: the
 * origin must be unreachable except through the tunnel before that header means
 * anything, and reading it here would silently make that assumption for every
 * deployment.
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
 * request carries no address the deployment vouches for. Callers choose their
 * own fallback (a shared bucket for rate limiting, `"unknown"` for an audit
 * log).
 */
export function getClientIp(request: Request): string | null {
  const onVercel = process.env.VERCEL === "1";
  const behindProxy = process.env.TRUST_PROXY === "1";

  if (onVercel) {
    const platformForwarded = firstAddress(
      request.headers.get("x-vercel-forwarded-for")
    );
    if (platformForwarded) return platformForwarded;

    const realIp = firstAddress(request.headers.get("x-real-ip"));
    if (realIp) return realIp;

    // Vercel overwrites this header at its edge, so the last hop is trustworthy.
    return lastAddress(request.headers.get("x-forwarded-for"));
  }

  if (behindProxy) {
    const realIp = firstAddress(request.headers.get("x-real-ip"));
    if (realIp) return realIp;

    /*
     * Take the LAST hop: the leftmost value is whatever the client claimed,
     * while the rightmost was appended by the nearest proxy.
     */
    return lastAddress(request.headers.get("x-forwarded-for"));
  }

  return null;
}

/**
 * How this deployment is allowed to identify a caller.
 *
 * `none` is the safe per-request answer (one shared bucket, so a client cannot
 * mint its own), but on a self-hosted deployment behind nginx it also means the
 * entire site shares a single API budget: 30 requests a minute, total, for
 * everyone. The symptom is mass 429s that look like an application bug, and no
 * request-path code can tell a human why.
 */
export type ClientIpTrust = "vercel" | "proxy" | "none";

export function getClientIpTrust(): ClientIpTrust {
  if (process.env.VERCEL === "1") return "vercel";
  if (process.env.TRUST_PROXY === "1") return "proxy";
  return "none";
}

/**
 * Warn once at boot when no trust boundary is declared, and report the state.
 *
 * Warning rather than throwing: a single-instance deployment is still usable,
 * just shared, and denying service over a variable a human can set live would
 * contradict the rest of the boot checks.
 */
export async function reportClientIpTrust(): Promise<ClientIpTrust> {
  const trust = getClientIpTrust();

  if (trust === "none" && process.env.NODE_ENV === "production") {
    // Imported dynamically: the proxy imports this module on every request and
    // the logger is only needed on this one startup path.
    const { childLogger } = await import("./logger");
    childLogger({ service: "client-ip" }).warn(
      "[clientIp] neither VERCEL=1 nor TRUST_PROXY=1 is set, so every caller shares one rate-limit bucket. " +
        "Set TRUST_PROXY=1 when a reverse proxy you control is the only path to this app (see DEPLOYMENT.md)."
    );
  }

  return trust;
}
