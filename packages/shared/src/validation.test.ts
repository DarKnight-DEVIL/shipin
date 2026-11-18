import { describe, expect, it } from "vitest";

import {
  formatMoney,
  sanitizeHtml,
  validateEmail,
  validateMoney,
  validatePhone,
} from "./validation";

describe("sanitizeHtml", () => {
  it("encodes the characters that break out of HTML text and attributes", () => {
    expect(sanitizeHtml(`<script>alert("x")&'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&amp;&#039;y&#039;&lt;/script&gt;"
    );
  });

  it("produces output with no live markup or attribute-breaking quotes", () => {
    const output = sanitizeHtml(`"><img src=x onerror="alert(1)">`);

    expect(output).not.toContain("<");
    expect(output).not.toContain(">");
    expect(output).not.toContain('"');
    expect(output).toBe(
      "&quot;&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });

  it("escapes the ampersand first so entities are not double-encoded", () => {
    expect(sanitizeHtml("a & b")).toBe("a &amp; b");
    expect(sanitizeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves plain text untouched", () => {
    expect(sanitizeHtml("Your parcel shipped")).toBe("Your parcel shipped");
  });
});

describe("validateEmail", () => {
  it("accepts a plain address", () => {
    expect(validateEmail("user@example.com")).toBe(true);
  });

  it("rejects addresses without a domain or with stray whitespace", () => {
    expect(validateEmail("not-an-email")).toBe(false);
    expect(validateEmail("user@")).toBe(false);
    expect(validateEmail(" user@example.com ")).toBe(false);
  });
});

describe("validatePhone", () => {
  it("accepts E.164 numbers with and without the plus", () => {
    expect(validatePhone("+14155552671")).toBe(true);
    expect(validatePhone("4155552671")).toBe(true);
  });

  it("rejects a leading zero, letters and an over-long number", () => {
    expect(validatePhone("0415555267")).toBe(false);
    expect(validatePhone("+1 (415) 555-2671")).toBe(false);
    expect(validatePhone("+1234567890123456")).toBe(false);
  });
});

describe("validateMoney", () => {
  it("accepts a positive amount with at most two decimals", () => {
    expect(validateMoney(19.99)).toBe(true);
    expect(validateMoney(0.01)).toBe(true);
  });

  it("rejects zero, negatives, sub-cent amounts and values over the cap", () => {
    expect(validateMoney(0)).toBe(false);
    expect(validateMoney(-5)).toBe(false);
    expect(validateMoney(0.001)).toBe(false);
    expect(validateMoney(1000000.01)).toBe(false);
  });

  it("tolerates the float noise of a summed amount", () => {
    // 0.1 + 0.2 is 0.30000000000000004; Zod's multipleOf works on the decimal
    // value, so callers do not have to round before validating.
    expect(validateMoney(0.1 + 0.2)).toBe(true);
    expect(validateMoney(1.005)).toBe(false);
  });
});

describe("formatMoney", () => {
  it("formats USD by default and honours another currency", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(10, "EUR")).toBe("€10.00");
  });
});
