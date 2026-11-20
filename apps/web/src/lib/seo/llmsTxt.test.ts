import { describe, expect, it } from "vitest";
import { INDEXABLE_ROUTES, canonicalUrl } from "@/config/seo";
import { buildLlmsTxt } from "./llmsTxt";

describe("buildLlmsTxt", () => {
  const txt = buildLlmsTxt();

  it("starts with the site name and a summary blockquote", () => {
    expect(txt.startsWith("# ")).toBe(true);
    expect(txt).toContain("\n> ");
  });

  it("lists every indexable route with an absolute URL", () => {
    for (const route of INDEXABLE_ROUTES) {
      expect(txt).toContain(`](${canonicalUrl(route)})`);
    }
  });

  it("never advertises a private route", () => {
    expect(txt).not.toMatch(/\]\(https?:\/\/[^)]*\/dashboard/);
    expect(txt).not.toMatch(/\]\(https?:\/\/[^)]*\/admin/);
    expect(txt).not.toContain("undefined");
  });
});
