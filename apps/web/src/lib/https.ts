/**
 * HTTPS enforcement for the request proxy.
 *
 * Vercel already redirects `http://` to `https://` before the app runs, and
 * `Strict-Transport-Security` makes browsers upgrade later visits. Neither
 * covers a host that terminates TLS on its own proxy in front of the app: there
 * an `http` request would be answered with 200, and HSTS only protects the
 * *next* request. The proxy therefore also redirects when the forwarded
 * protocol says the request arrived insecure.
 */
export function isInsecureRequest(
  forwardedProto: string | null | undefined
): boolean {
  if (!forwardedProto) {
    // No proxy header (local `next dev`, same-origin test requests): nothing
    // to judge, and guessing would break loopback development.
    return false;
  }

  // A chain can report `https, http`; the first entry is the client's protocol.
  const protocol = forwardedProto.split(",")[0]?.trim().toLowerCase();
  return protocol === "http";
}

/**
 * Whether a host is the local machine.
 *
 * The redirect above must never fire for loopback: Next's own server sets
 * `x-forwarded-proto: http` when it starts without TLS, so a production build
 * served locally (`npm start`, the E2E suite) would otherwise answer every
 * request with a 308 to an https URL that nothing is listening on — an
 * infinite redirect the Playwright web-server check reports only as a start
 * timeout.
 */
export function isLoopbackHost(host: string | null | undefined): boolean {
  if (!host) return false;

  // `hostname` is bracketed for IPv6 literals (`[::1]`).
  const name = host.trim().toLowerCase().replace(/^\[|\]$/g, "");

  // A bare IPv4 literal in 127.0.0.0/8; `127.0.0.1.example.com` is a real
  // hostname and must keep the HTTPS redirect.
  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name === "::1" ||
    name === "0.0.0.0" ||
    /^127(?:\.\d{1,3}){3}$/.test(name)
  );
}
