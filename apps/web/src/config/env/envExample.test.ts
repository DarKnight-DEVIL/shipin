import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * `.env.example` has to name every variable production requires.
 *
 * The template is what a developer copies on their first deploy, so a required
 * variable missing from it can only be discovered from a startup error — after
 * the fact and with no hint where the value comes from. Nothing enforced that
 * until this test, and the three declarations it reads are individually easy to
 * extend without remembering the template.
 *
 * The names are read out of `production.ts` as source text rather than
 * imported: `index.ts` builds `clientEnv` at load time, which validates the
 * `NEXT_PUBLIC_*` variables and throws in a unit-test process, and
 * `vitest.setup.ts` mocks `@/config/env` for the same reason. `production.ts`
 * is the module both scripts load under plain Node, so it is also the copy that
 * must stay complete.
 */

const source = readFileSync(
  new URL("./production.ts", import.meta.url),
  "utf8"
).replace(/\r\n/g, "\n");

const template = readFileSync(
  new URL("../../../.env.example", import.meta.url),
  "utf8"
).replace(/\r\n/g, "\n");

/** Quoted variable names from one declaration, up to its closing bracket. */
function namesIn(marker: string): string[] {
  const declaration = source.match(
    new RegExp(`${marker}[\\s\\S]*?\\]\\s*(?:as const\\s*)?;`)
  )?.[0];

  if (!declaration) return [];

  return [...declaration.matchAll(/"([A-Z][A-Z0-9_]+)"/g)].map(
    (match) => match[1]
  );
}

const required = [
  ...namesIn("const REQUIRED_SERVER_ENV"),
  ...namesIn("const PRODUCTION_REQUIRED_SERVER_ENV"),
  ...namesIn("const RATE_LIMIT_STORE_SERVER_ENV"),
];

/**
 * True when a comment block claims the variable's value is made up for it —
 * "if unset, a key is derived from FIREBASE_ADMIN_PRIVATE_KEY" was the wording
 * that told operators a missing secret was harmless.
 *
 * Deliberately sentence-scoped and narrow: a negation ("nothing is derived
 * from …") and a development-only behaviour ("in development the limiter falls
 * back to memory") are accurate and must not fail the guard, so a fallback only
 * counts when the sentence is about the variable being unset.
 */
function claimsDerivedFallback(text: string): boolean {
  const sentences = text.split(/(?<=[.!?])\s+|\n/);

  return sentences.some((sentence) => {
    const aboutUnset = /\b(unset|missing|absent|blank|empty)\b/i.test(sentence);

    const derived = /(derived|derives?)\s+from/i.exec(sentence);
    if (derived) {
      const before = sentence.slice(0, derived.index);
      if (!/\b(nothing|no|never|not)\b/i.test(before)) return true;
    }

    if (aboutUnset && /falls?\s+back\s+to|defaults?\s+to/i.test(sentence)) {
      return true;
    }

    return false;
  });
}

const documented = new Set(
  template
    .split("\n")
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter((name): name is string => Boolean(name))
);

describe(".env.example", () => {
  it("is read by this test at all", () => {
    // Guards the guard: if the parsing above ever breaks, every assertion below
    // would pass while checking nothing. 13 runtime + 2 production-only + the
    // two rate-limit variables is the floor.
    expect(required.length).toBeGreaterThanOrEqual(17);
    expect(documented.size).toBeGreaterThan(30);
  });

  it("documents every variable production requires", () => {
    const missing = [...new Set(required)].filter(
      (name) => !documented.has(name)
    );

    expect(
      missing,
      `required in production but absent from .env.example: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("says every required variable is required", () => {
    // The template used to head the MFA section "(optional)" and claim that a
    // missing secret was derived from the Firebase Admin key. Both were wrong —
    // production refuses to boot without it, and `mfaSession.ts` fails closed
    // rather than deriving anything — so the file told operators to skip a
    // variable that stops the deploy. `APP_URL` was "an optional convenience"
    // while link-building throws without an absolute value.
    //
    // What matters is the claim, not the word: "required in production,
    // optional in development" is accurate for the Upstash pair and every
    // other variable that only a deploy must set, so `optional` is allowed as
    // long as the same block also says the variable is required. A section
    // header counts for the variables grouped under it (`# --- PayPal ---`
    // introduces three credentials), which is why the header text is included
    // when looking for the claim.
    const lines = template.split("\n");
    const missingClaim: string[] = [];
    const contradicts: string[] = [];
    const derivedFallback: string[] = [];

    for (const name of new Set(required)) {
      const index = lines.findIndex((line) => line.startsWith(`${name}=`));
      // Absence is the test above's job; skip so the failure names one cause.
      if (index === -1) continue;

      // The contiguous comment block immediately above the assignment.
      const block: string[] = [];
      for (let i = index - 1; i >= 0 && lines[i].startsWith("#"); i -= 1) {
        block.unshift(lines[i]);
      }

      // The most recent `# --- … ---` header above it, if any.
      let section = "";
      for (let i = index - 1; i >= 0; i -= 1) {
        if (/^#\s*---/.test(lines[i])) {
          section = lines[i];
          break;
        }
      }

      const blockText = block.join("\n");
      const text = `${blockText}\n${section}`;

      if (!/\brequired\b/i.test(text)) {
        missingClaim.push(name);
      }

      // Every line that calls the variable optional has to say required too,
      // which is what makes "required in production, optional in development"
      // acceptable and a bare "(optional)" header — or an "Optional:" line
      // under a required section — a failure.
      if (
        block.some(
          (line) => /\boptional\b/i.test(line) && !/\brequired\b/i.test(line)
        )
      ) {
        contradicts.push(name);
      }

      if (claimsDerivedFallback(text)) {
        derivedFallback.push(name);
      }
    }

    expect(
      missingClaim,
      `required in production but never described as required: ${missingClaim.join(", ")}`
    ).toEqual([]);
    expect(
      contradicts,
      `required in production but marked optional without saying required: ${contradicts.join(", ")}`
    ).toEqual([]);
    expect(
      derivedFallback,
      `required in production but documented as falling back to a derived value: ${derivedFallback.join(", ")}`
    ).toEqual([]);
  });

  it("ships placeholders, never a working credential", () => {
    // Two unmistakable shapes only: a pasted PEM block, or a long opaque base64
    // token. Kebab-case placeholders such as
    // `change-me-to-a-32-plus-character-secret` are deliberately not flagged —
    // this check must never fail on the placeholder it is meant to encourage.
    const suspicious = template
      .split("\n")
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .filter((line) => {
        const value = line.slice(line.indexOf("=") + 1).trim();
        return /-----BEGIN/.test(value) || /^[A-Za-z0-9+/=]{40,}$/.test(value);
      });

    expect(suspicious).toEqual([]);
  });
});
