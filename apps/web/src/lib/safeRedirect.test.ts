import { describe, expect, it } from "vitest";

import { safeInternalPath } from "./safeRedirect";

/**
 * A literal backslash, spelled out rather than typed, so these cases cannot be
 * lost to another layer of escaping. WHATWG treats it as "/" in an http(s)
 * URL, which is the whole trick behind the bypass below.
 */
const BS = String.fromCharCode(92);

describe("safeInternalPath", () => {
  it("rejects a protocol-relative URL", () => {
    expect(safeInternalPath("//evil.com")).toBeNull();
    expect(safeInternalPath("//evil.com/dashboard")).toBeNull();
  });

  it("rejects the backslash bypass", () => {
    // This resolves to "https://evil.com/". The old startsWith guard let it
    // through: it does start with "/", and it does not start with "//".
    expect(safeInternalPath(`/${BS}evil.com`)).toBeNull();
    expect(safeInternalPath(`${BS}${BS}evil.com`)).toBeNull();
    expect(safeInternalPath(`/${BS}/evil.com`)).toBeNull();
  });

  it("rejects absolute cross-origin and non-http schemes", () => {
    expect(safeInternalPath("https://evil.com/x")).toBeNull();
    expect(safeInternalPath("javascript:alert(1)")).toBeNull();
    expect(safeInternalPath("data:text/html,<b>x</b>")).toBeNull();
  });

  it("accepts a valid relative path", () => {
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/admin/requests?tab=open#top")).toBe(
      "/admin/requests?tab=open#top"
    );
    expect(safeInternalPath("  /wallet  ")).toBe("/wallet");
  });

  it("accepts a bare relative target and returns it rooted, on purpose", () => {
    // Deliberate widening: the old guard required a leading slash. The origin
    // check is the boundary, and a relative reference cannot leave the base
    // origin, so rooting is enough. Pinned here so the behaviour is a decision
    // rather than an accident of `new URL`.
    expect(safeInternalPath("dashboard")).toBe("/dashboard");
    expect(safeInternalPath("wallet?tab=1#top")).toBe("/wallet?tab=1#top");

    // A bare host-shaped value stays on this origin: a 404 here, never an
    // off-site redirect.
    expect(safeInternalPath("evil.com")).toBe("/evil.com");
  });

  it("returns null for missing or empty input", () => {
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
    expect(safeInternalPath("")).toBeNull();
    expect(safeInternalPath("   ")).toBeNull();
  });
});
