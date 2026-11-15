/**
 * Mirror of `src/lib/privateKey.ts` for the standalone node scripts here, which
 * run without the TypeScript build. Keep the two in step: a PEM body is base64,
 * so every backslash in the value is escaping, however deeply it was escaped.
 */

const PEM_BEGIN = '-----BEGIN';

function stripWrappingQuotes(value) {
  let current = value;

  for (;;) {
    const quoted =
      current.length > 1 &&
      ((current[0] === '"' && current[current.length - 1] === '"') ||
        (current[0] === "'" && current[current.length - 1] === "'"));

    if (!quoted) return current;

    current = current.slice(1, -1).trim();
  }
}

function decodeIfBase64(value) {
  if (value.includes(PEM_BEGIN)) return value;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) return value;

  const decoded = Buffer.from(
    value.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf8');

  return decoded.includes(PEM_BEGIN) ? decoded.trim() : value;
}

function unescapeNewlines(value) {
  return value.replace(/\\+r\\+n/g, '\n').replace(/\\+[rn]/g, '\n');
}

export function normalizePrivateKey(raw) {
  if (!raw) return '';

  const trimmed = String(raw).trim();
  if (!trimmed) return '';

  return unescapeNewlines(decodeIfBase64(stripWrappingQuotes(trimmed)))
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
