import { test, expect } from "@playwright/test";

test.describe("SEO files", () => {
  test("robots.txt is valid and references the sitemap", async ({
    request,
  }) => {
    const response = await request.get("/robots.txt");
    expect(
      response.status(),
      `robots.txt status: ${response.status()} body: ${await response.text()}`
    ).toBe(200);
    const body = await response.text();
    // Directive names are case-insensitive (RFC 9309), and Next emits
    // `User-Agent:` / `Sitemap:` — asserting a lowercase form failed on a
    // correct file.
    expect(body.toLowerCase()).toContain("user-agent:");
    expect(body.toLowerCase()).toContain("sitemap:");
    expect(body).toContain("/sitemap.xml");
  });

  test("sitemap.xml is valid XML and references key pages", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");
    expect(
      response.status(),
      `sitemap.xml status: ${response.status()} body: ${await response.text()}`
    ).toBe(200);
    const body = await response.text();
    expect(body).toContain("<?xml");
    expect(body).toContain("<urlset");
    // Public, indexable pages only. The origin comes from NEXT_PUBLIC_APP_URL,
    // which the E2E runner points at the local server.
    const base = new URL(response.url()).origin;
    for (const route of ["/", "/track", "/privacy-policy", "/terms"]) {
      expect(body).toContain(`<loc>${base}${route}</loc>`);
    }

    // The proxy sends X-Robots-Tag: noindex for these, so listing them here was
    // what Search Console reported as "Excluded by noindex tag".
    for (const privateRoute of [
      "/login",
      "/requests",
      "/wallet",
      "/settings",
      "/support",
    ]) {
      expect(body).not.toContain(privateRoute);
    }
  });
});
