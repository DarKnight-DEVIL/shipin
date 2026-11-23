/**
 * Licence-gate logic for `scripts/check-licenses.mjs`.
 *
 * Kept out of the CLI so the parsing and the allowlist rules can be tested:
 * SPDX expressions are not plain strings ("Apache-2.0 AND LGPL-3.0-or-later",
 * "(MPL-2.0 OR Apache-2.0)", "MIT OR SEE LICENSE IN FEEL-FREE.md"), and a gate
 * that mangles them either passes a copyleft dependency or fails a permissive
 * one. Both outcomes are worse than having no gate, because the second gets
 * the gate deleted.
 */

/**
 * Licences a shipped dependency may carry without a decision.
 *
 * The list is deliberately about *distribution*: MIT/ISC/BSD/Apache/0BSD and
 * friends impose attribution only; MPL-2.0 is file-level copyleft that leaves
 * our own files alone; CC-BY-4.0 is a data set (caniuse-lite) whose attribution
 * the `/licences` page carries; LGPL-3.0-or-later is the libvips family behind
 * `sharp`, whose native binaries are shipped as-is and credited on the same
 * page. Each of those is a licence *choice already made and documented*, which
 * is what separates them from the entries the allowlist has to carry.
 */
export const PERMITTED_LICENSES = new Set(
  [
    "MIT",
    "MIT-0",
    "ISC",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "0BSD",
    "Apache-2.0",
    "Unlicense",
    "CC0-1.0",
    "BlueOak-1.0.0",
    "MPL-2.0",
    "CC-BY-4.0",
    "Python-2.0",
    "Zlib",
    "LGPL-3.0-or-later",
    // `victory-vendor` bundles d3 under its own BSD notice; the identifier is
    // unusual but the terms are the permissive BSD.
    "BSD-3-Clause-No-Nuclear-License",
  ].map((id) => id.toLowerCase())
);

/** A licence field npm could not read at all. */
export const MISSING = "missing";

/**
 * Collects the licence identifiers in an SPDX expression.
 *
 * `SEE LICENSE IN <file>` is replaced by a placeholder identifier rather than
 * parsed as three license names — `rgbcolor` publishes
 * "MIT OR SEE LICENSE IN FEEL-FREE.md", and MIT is what makes it usable.
 */
export function licenseIds(expression) {
  return String(expression ?? "")
    .replace(/SEE LICENSE IN \S+/gi, "SEE-LICENSE")
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter(
      (token) =>
        token.length > 0 &&
        token.toUpperCase() !== "AND" &&
        token.toUpperCase() !== "OR"
    );
}

/**
 * Evaluates an SPDX expression against the permitted set.
 *
 * AND binds tighter than OR, per the SPDX specification. An identifier we do
 * not recognise is simply not permitted, so an unknown `SEE-LICENSE` still
 * passes inside an OR when the other branch is allowed.
 */
export function isPermitted(expression, permitted = PERMITTED_LICENSES) {
  const tokens = String(expression ?? "")
    .replace(/SEE LICENSE IN \S+/gi, "SEE-LICENSE")
    .replace(/[()]/g, " $& ")
    .split(/\s+/)
    .filter(Boolean);

  let index = 0;

  const peekKeyword = (keyword) =>
    tokens[index]?.toUpperCase() === keyword;

  const parseOr = () => {
    let value = parseAnd();
    while (peekKeyword("OR")) {
      index += 1;
      const right = parseAnd();
      value = value || right;
    }
    return value;
  };

  const parseAnd = () => {
    let value = parsePrimary();
    while (peekKeyword("AND")) {
      index += 1;
      const right = parsePrimary();
      value = value && right;
    }
    return value;
  };

  const parsePrimary = () => {
    if (tokens[index] === "(") {
      index += 1;
      const value = parseOr();
      if (tokens[index] === ")") index += 1;
      return value;
    }
    const token = tokens[index];
    index += 1;
    return token !== undefined && permitted.has(token.toLowerCase());
  };

  if (tokens.length === 0) return false;

  const result = parseOr();
  // A trailing token means the expression was not understood; treat that as a
  // failure rather than silently ignoring the part we could not read.
  return result && index === tokens.length;
}

/** `@splinetool/*` style prefix matching; no other glob syntax is supported. */
export function matchesPackage(name, pattern) {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) return name.startsWith(pattern.slice(0, -1));
  return name === pattern;
}

/**
 * Name of the package a lockfile path belongs to.
 *
 * `node_modules/@scope/pkg` and `node_modules/a/node_modules/@scope/pkg` both
 * resolve to `@scope/pkg`.
 */
export function packageNameFromPath(path, entry) {
  if (typeof entry?.name === "string") return entry.name;
  const marker = "node_modules/";
  const index = path.lastIndexOf(marker);
  return index === -1 ? path : path.slice(index + marker.length);
}

/**
 * Production packages with their licence, from an npm lockfile v2/v3.
 *
 * Workspace packages are symbolic links to source this repository owns, and dev
 * entries are build/test tooling that never ships — the same scope `npm audit
 * --omit=dev` uses, so the two gates agree on what "production" means.
 */
export function productionPackages(lockfile) {
  const packages = [];

  for (const [path, entry] of Object.entries(lockfile.packages ?? {})) {
    if (!entry || entry.link) continue;
    if (!path.includes("node_modules/")) continue;
    if (entry.dev) continue;

    const license =
      typeof entry.license === "string"
        ? entry.license
        : typeof entry.license?.type === "string"
          ? entry.license.type
          : "";

    packages.push({
      name: packageNameFromPath(path, entry),
      license: license.trim(),
      optional: Boolean(entry.optional),
    });
  }

  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Applies the gate.
 *
 * Returns the packages that need a decision and the allowlist entries that
 * have expired. Expiry is checked on every run, whether or not the entry is
 * used: an exception that stops being true must not survive because the
 * package happened to leave the tree.
 */
export function checkLicenses(
  packages,
  { allowlist = [], permitted = PERMITTED_LICENSES, today = new Date() } = {}
) {
  const todayIso = today.toISOString().slice(0, 10);

  const expired = allowlist.filter((entry) => entry.expires < todayIso);

  const violations = [];
  const allowed = [];

  for (const pkg of packages) {
    const license = pkg.license || MISSING;
    const satisfied = pkg.license
      ? isPermitted(pkg.license, permitted)
      : false;

    if (satisfied) continue;

    const ids = pkg.license ? licenseIds(pkg.license) : [MISSING];

    const entry = allowlist.find(
      (candidate) =>
        matchesPackage(pkg.name, candidate.package) &&
        (candidate.license === "*" ||
          ids.some((id) => id.toLowerCase() === candidate.license.toLowerCase()) ||
          (candidate.license === MISSING && !pkg.license))
    );

    if (entry) {
      allowed.push({ ...pkg, license, expires: entry.expires });
      continue;
    }

    violations.push({ ...pkg, license });
  }

  return { violations, allowed, expired };
}
