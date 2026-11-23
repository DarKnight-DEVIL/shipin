/**
 * Same-origin redirect targets for the `next` parameter.
 *
 * `next` is attacker-controlled: it rides in on the sign-in URL, which is
 * exactly the link a phishing page hands out. The previous guard
 * (`startsWith("/") && !startsWith("//")`) missed a slash followed by a
 * backslash, because for http(s) URLs the WHATWG parser folds a backslash into
 * a slash — so that value is protocol-relative, `//evil.com` in disguise.
 *
 * Resolving against a fixed sentinel origin is what closes it: the *resolved*
 * URL's origin is checked, not the raw string. A cross-origin result, and a
 * non-http scheme (`javascript:`, `data:`), return null; a same-origin result
 * comes back as a path only, never as an absolute URL.
 *
 * The sentinel is a fixed `.invalid` origin rather than `window.location` so
 * the helper is deterministic during prerender and in tests. Successfully
 * guessing it yields a *relative* path, which stays on this origin anyway.
 *
 * Bare relative values (`dashboard`) are accepted on purpose, and they come
 * back rooted (`/dashboard`). That is the deliberate part of the widening: the
 * boundary this function enforces is the RESOLVED ORIGIN, and a relative
 * reference cannot leave the base origin — only an absolute URL or a
 * protocol-relative one can, and both are rejected above. `evil.com` therefore
 * resolves to `/evil.com` on this site, not to `//evil.com`.
 *
 * The leading-slash rule the old guard had was a string-shape check, and shape
 * checks are what missed `/<backslash>evil.com`. Re-adding it on top of the
 * origin check would restore a second rule to keep in sync, reject values that
 * are provably safe, and still not be the thing that stops the bypass.
 */
const SENTINEL_ORIGIN = "https://shipin.invalid";

export function safeInternalPath(
  candidate: string | null | undefined
): string | null {
  if (typeof candidate !== "string") return null;

  const value = candidate.trim();
  if (!value) return null;

  let resolved: URL;
  try {
    resolved = new URL(value, SENTINEL_ORIGIN);
  } catch {
    // Not parseable as a URL reference at all.
    return null;
  }

  if (resolved.origin !== SENTINEL_ORIGIN) return null;

  // Path only: router.replace must never receive an absolute URL.
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
