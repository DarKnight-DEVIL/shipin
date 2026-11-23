import { describe, it, expect } from "vitest";

import {
  ALIAS_LENGTH,
  buildAlias,
  generateAliasSuffix,
  hasExpired,
  parseAlias,
} from "./trackingAlias.mjs";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

describe("tracking alias: generateAliasSuffix (Crockford base32)", () => {
  it("generates an 8-character suffix by default", () => {
    const suffix = generateAliasSuffix();

    expect(suffix).toHaveLength(ALIAS_LENGTH);
    for (const char of suffix) {
      expect(ALPHABET).toContain(char);
    }
  });

  it("maps bytes into the alphabet without I, L, O or U", () => {
    // 0x00 -> "0", 0x01 -> "1", 0xff & 0x1f -> last alphabet character.
    expect(generateAliasSuffix(Buffer.from([0, 1, 2]))).toBe("012");
    expect(generateAliasSuffix(Buffer.from([255]))).toBe(ALPHABET[31]);

    const suffix = generateAliasSuffix(Buffer.alloc(64, 0xff));
    for (const invalid of ["I", "L", "O", "U"]) {
      expect(suffix).not.toContain(invalid);
    }
  });
});

describe("tracking alias: buildAlias", () => {
  it("produces SHP-<trackingId>-<8 chars>", () => {
    const alias = buildAlias("ABC123");

    expect(alias).toMatch(/^SHP-[A-Z0-9]+-[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("round-trips through parseAlias", () => {
    expect(parseAlias(buildAlias("ABC123"))).toBe("ABC123");
  });
});

describe("tracking alias: parseAlias", () => {
  it("parses a valid alias and extracts the tracking ID", () => {
    expect(parseAlias("SHP-ABC123-XYZ789AB")).toBe("ABC123");
  });

  it.each([
    ["not-an-alias"],
    ["SHP-ABC"], // no suffix
    ["SHP-ABC123-XYZ"], // suffix too short
    ["SHP-ABC123-XYZ789ABC"], // suffix too long
    ["SHP-ABC123-xyz789ab"], // lowercase suffix
    ["SHP-ABC123-XYZI89AB"], // I is not in the alphabet
    ["shp-ABC123-XYZ789AB"], // wrong prefix
  ])("returns null for a malformed alias %s", (alias) => {
    expect(parseAlias(alias)).toBeNull();
  });
});

describe("tracking alias: hasExpired", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("treats a missing expiry as expired", () => {
    expect(hasExpired(null, now)).toBe(true);
    expect(hasExpired(undefined, now)).toBe(true);
    expect(hasExpired("", now)).toBe(true);
  });

  it("reports past timestamps as expired", () => {
    expect(hasExpired(new Date("2026-05-31T12:00:00Z"), now)).toBe(true);
    expect(hasExpired("2026-05-31T12:00:00Z", now)).toBe(true);
  });

  it("reports future timestamps as valid", () => {
    expect(hasExpired(new Date("2026-06-02T12:00:00Z"), now)).toBe(false);
    expect(hasExpired("2026-06-02T12:00:00Z", now)).toBe(false);
  });
});
