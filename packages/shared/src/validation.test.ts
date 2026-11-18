import { describe, expect, it } from "vitest";

import { sanitizeHtml } from "./validation";

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
