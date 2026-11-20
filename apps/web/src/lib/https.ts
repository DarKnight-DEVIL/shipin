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
