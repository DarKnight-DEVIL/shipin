import { describe, it, expect } from "vitest";

import { hashBackupCode, verifyBackupCode } from "./mfaBackupCodes";

/**
 * These two functions are the contract between the app's enrolment route and the
 * break-glass script. A code hashed by one must verify with the other, so the
 * tests pin the stored format as well as the round trip.
 */
describe("hashBackupCode", () => {
  it("stores salt and key as 160 hex characters and never the code itself", () => {
    const hash = hashBackupCode("ABCD-EF01-2345-6789");

    expect(hash).toMatch(/^[0-9a-f]{160}$/);
    expect(hash).not.toContain("ABCD");
  });

  it("salts every code, so the same code hashes differently each time", () => {
    const first = hashBackupCode("SAME-CODE");
    const second = hashBackupCode("SAME-CODE");

    expect(first).not.toBe(second);
    expect(verifyBackupCode("SAME-CODE", [first])).toBe(0);
    expect(verifyBackupCode("SAME-CODE", [second])).toBe(0);
  });

  it("normalises case and padding, because clients print capitals", () => {
    const hash = hashBackupCode("abcd-ef01");

    expect(verifyBackupCode("  ABCD-EF01  ", [hash])).toBe(0);
  });
});

describe("verifyBackupCode", () => {
  it("returns the index of the matching code so it can be consumed", () => {
    const codes = ["A", "B", "C"].map(hashBackupCode);

    expect(verifyBackupCode("C", codes)).toBe(2);
  });

  it("returns -1 for a code that is not stored", () => {
    expect(verifyBackupCode("NOPE", [hashBackupCode("REAL")])).toBe(-1);
  });

  it("skips a plaintext entry instead of throwing on it", () => {
    // A document written before hashing existed, or by a buggy writer, must not
    // turn a login attempt into a 500.
    expect(verifyBackupCode("ABC", ["ABC-1234-5678"])).toBe(-1);
  });

  it("does not match across entries when one code consumes another's slot", () => {
    const codes = ["ONE", "TWO"].map(hashBackupCode);

    expect(verifyBackupCode("TWO", codes)).toBe(1);
    expect(verifyBackupCode("THREE", codes)).toBe(-1);
  });
});
