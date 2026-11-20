/**
 * Guards `normalizePrivateKey`, which is what turns the raw
 * `FIREBASE_ADMIN_PRIVATE_KEY` env variable into something `cert()` accepts.
 *
 * The failure this suite exists for is silent-ish: `.env.local` in this repo
 * stores the key double-escaped (`\\n`), and a single `\n` replacement leaves a
 * backslash at the end of every line, so OpenSSL answers "DECODER routines::
 * unsupported" rather than anything that mentions the escaping.
 *
 * Every case asserts the *same* canonical PEM comes out, so a change that fixes
 * one shape cannot quietly break another.
 */

import { createPrivateKey, generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { normalizePrivateKey } from "./privateKey";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const canonical = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString()
  .trim();

/** `.env` convention: one line, single backslash escapes. */
const singleEscaped = canonical.replace(/\n/g, "\\n");
/** What `.env.local` actually holds: the escapes escaped again. */
const doubleEscaped = canonical.replace(/\n/g, "\\\\n");
/** Some secret stores escape yet again on write. */
const tripleEscaped = canonical.replace(/\n/g, "\\\\\\\\n");

describe("normalizePrivateKey", () => {
  it("returns an empty string when nothing is configured", () => {
    expect(normalizePrivateKey(undefined)).toBe("");
    expect(normalizePrivateKey(null)).toBe("");
    expect(normalizePrivateKey("")).toBe("");
    expect(normalizePrivateKey("   ")).toBe("");
  });

  it("leaves a key that already has real newlines untouched", () => {
    expect(normalizePrivateKey(canonical)).toBe(canonical);
  });

  it("unescapes a single-escaped key", () => {
    expect(normalizePrivateKey(singleEscaped)).toBe(canonical);
  });

  it("unescapes the double-escaped key .env.local stores", () => {
    expect(normalizePrivateKey(doubleEscaped)).toBe(canonical);
  });

  it("unescapes however many times the value was escaped", () => {
    expect(normalizePrivateKey(tripleEscaped)).toBe(canonical);
  });

  it("strips the quotes an env file leaves around the value", () => {
    expect(normalizePrivateKey(`"${canonical}"`)).toBe(canonical);
    expect(normalizePrivateKey(`'${singleEscaped}'`)).toBe(canonical);
    expect(normalizePrivateKey(`"${doubleEscaped}"`)).toBe(canonical);
    expect(normalizePrivateKey(`  ${doubleEscaped}  `)).toBe(canonical);
  });

  it("decodes a key stored base64-encoded for a secret store", () => {
    const encoded = Buffer.from(canonical, "utf8").toString("base64");
    expect(normalizePrivateKey(encoded)).toBe(canonical);
  });

  it("removes the trailing spaces copy-paste leaves on wrapped lines", () => {
    const withSpaces = canonical.replace(/\n/g, "   \n");
    expect(normalizePrivateKey(withSpaces)).toBe(canonical);
  });

  it("produces a key node can actually parse, from every shape", () => {
    for (const variant of [
      canonical,
      singleEscaped,
      doubleEscaped,
      tripleEscaped,
      `"${doubleEscaped}"`,
      Buffer.from(canonical, "utf8").toString("base64"),
    ]) {
      const parsed = createPrivateKey(normalizePrivateKey(variant));
      expect(parsed.asymmetricKeyType).toBe("rsa");
      expect(parsed.asymmetricKeyDetails?.modulusLength).toBe(2048);
    }
  });

  it("strips layers of quoting, however many there are", () => {
    expect(normalizePrivateKey(`"\"${doubleEscaped}\""`)).toBe(canonical);
  });

  it("leaves a short base64-shaped value alone instead of decoding it", () => {
    // Matches the base64 character class, but a PEM body is never this short.
    expect(normalizePrivateKey("abcdef0123456789abcdef")).toBe(
      "abcdef0123456789abcdef"
    );
  });

  it("leaves a value that is not a key alone", () => {
    // The suite's own fixture value: base64-shaped, but not a PEM.
    expect(normalizePrivateKey("test-key")).toBe("test-key");
    expect(normalizePrivateKey("not a key at all")).toBe("not a key at all");
  });
});
