/**
 * Decode a service-account private key out of an environment variable.
 *
 * `FIREBASE_ADMIN_PRIVATE_KEY` reaches the process in whatever shape the env
 * file happened to store it, and the shapes disagree:
 *
 *   - real newlines, from a shell that exported a multi-line value;
 *   - one line with `\n` escapes, the `.env` convention;
 *   - one line with `\n` escapes — `.env.local` in this repo does this, which
 *     turns a single pass of `\n` replacement into a PEM with a stray backslash
 *     at the end of every line and an "unsupported" decoder error from OpenSSL;
 *   - a whole key base64-encoded, which some CI secret stores require.
 *
 * A PEM body is base64, so it never contains a backslash of its own: every
 * backslash in the value is escaping, however many times it was escaped.
 */

const PEM_BEGIN = "-----BEGIN";

function stripWrappingQuotes(value: string): string {
  // Strip however many layers of quoting a secret store added. Each pass
  // shortens the value, so this always terminates.
  let current = value;

  for (;;) {
    const first = current[0];
    const last = current[current.length - 1];
    const quoted =
      current.length > 1 &&
      ((first === '"' && last === '"') || (first === "'" && last === "'"));

    if (!quoted) return current;

    current = current.slice(1, -1).trim();
  }
}

/**
 * Remove surrounding double-quotes that wrap the entire .env.local value.
 * .env.local often stores the key as:
 *   FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
 * This must be stripped BEFORE newline unescaping, otherwise the trailing
 * quote ends up inside the PEM and breaks parsing.
 * Also handles trailing commas that some tools erroneously append.
 */
function stripEnvValueQuotes(value: string): string {
  let trimmed = value.trim();

  // Strip trailing comma if present (some secret stores append one)
  if (trimmed.endsWith(",")) {
    trimmed = trimmed.slice(0, -1).trim();
  }

  if (
    trimmed.length >= 2 &&
    trimmed[0] === '"' &&
    trimmed[trimmed.length - 1] === '"'
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * A base64-encoded RSA/EC PEM is well over a kilobyte. The character-class
 * check alone also matches short opaque values such as "abc123", so anything
 * this short is left alone instead of being handed to the decoder.
 */
const MIN_BASE64_KEY_LENGTH = 100;

function decodeIfBase64(value: string): string {
  if (value.includes(PEM_BEGIN)) return value;
  if (value.length < MIN_BASE64_KEY_LENGTH) return value;
  // Standard or URL-safe base64, with or without padding.
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) return value;

  const decoded = Buffer.from(
    value.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf8");

  // Only trust the decode when it actually produced a key; anything else means
  // the variable was some other opaque string, not an encoded PEM.
  return decoded.includes(PEM_BEGIN) ? decoded.trim() : value;
}

function unescapeNewlines(value: string): string {
  // Match the whole run of backslashes before the n/r. Replacing only the last
  // one — the natural `\n` pass — leaves a stray backslash at the end of every
  // line, which is exactly the shape that makes OpenSSL say "unsupported"
  // instead of naming the problem.
  return value.replace(/\\+r\\+n/g, "\n").replace(/\\+[rn]/g, "\n");
}

/**
 * Validate that a normalized PEM key can actually be used by firebase-admin.
 * Throws with a descriptive error if the key is malformed.
 * Only validates when the input looks like it should be a PEM key (contains PEM_BEGIN).
 * Non-key values (short strings, base64-shaped values that aren't keys) pass through.
 */
function validatePrivateKey(pem: string): void {
  // Only validate if this looks like a PEM key (has BEGIN marker).
  // Non-key values like "test-key" or short base64 strings pass through unchanged.
  if (!pem.includes(PEM_BEGIN)) {
    return;
  }

  if (!pem.includes("-----END")) {
    throw new Error("Private key does not contain a valid PEM footer (-----END)");
  }
  // Basic structure check: should have BEGIN, base64 content, END
  const lines = pem.split("\n");
  if (lines.length < 3) {
    throw new Error("Private key has too few lines to be a valid PEM");
  }
  // Ensure it looks like a PKCS#8 or PKCS#1 key
  const hasPrivateKeyMarker =
    pem.includes("PRIVATE KEY") || pem.includes("RSA PRIVATE KEY") || pem.includes("EC PRIVATE KEY");
  if (!hasPrivateKeyMarker) {
    throw new Error("Private key does not contain PRIVATE KEY marker");
  }
}

/**
 * Return a PEM that `createPrivateKey`/`cert()` accepts, or an empty string when
 * nothing was supplied. Escaped newlines, wrapping quotes, trailing spaces and
 * base64 storage are all tolerated; the key material is never altered.
 * 
 * Throws if the normalized key fails validation (does not look like a valid PEM).
 * Non-key values (short strings, base64-shaped values that aren't keys) pass through unchanged.
 */
export function normalizePrivateKey(raw: string | null | undefined): string {
  if (!raw) return "";

  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Strip .env.local value wrapping quotes FIRST, before any unescaping.
  const withoutEnvQuotes = stripEnvValueQuotes(trimmed);

  const normalized = (
    unescapeNewlines(decodeIfBase64(stripWrappingQuotes(withoutEnvQuotes)))
      // Copy-paste often leaves a trailing space on wrapped lines; OpenSSL
      // rejects the key for it, and no PEM line legitimately ends in whitespace.
      .replace(/[ \t]+\n/g, "\n")
      .trim()
  );

  // Validate the normalized key structure before returning
  validatePrivateKey(normalized);

  return normalized;
}
