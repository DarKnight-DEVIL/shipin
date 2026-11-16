import { test, expect } from '@playwright/test';

test.describe('SEO files', () => {
  test('robots.txt is valid and references the sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status(), `robots.txt status: ${response.status()} body: ${await response.text()}`).toBe(200);
    const body = await response.text();
    // Directive names are case-insensitive (RFC 9309), and Next emits
    // `User-Agent:` / `Sitemap:` — asserting a lowercase form failed on a
    // correct file.
    expect(body.toLowerCase()).toContain('user-agent:');
    expect(body.toLowerCase()).toContain('sitemap:');
    expect(body).toContain('/sitemap.xml');
  });

  test('sitemap.xml is valid XML and references key pages', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status(), `sitemap.xml status: ${response.status()} body: ${await response.text()}`).toBe(200);
    const body = await response.text();
    expect(body).toContain('<?xml');
    expect(body).toContain('<urlset');
    expect(body).toContain('https://shipin.co/');
    expect(body).toContain('/login');
    expect(body).toContain('/track');
    expect(body).toContain('/privacy-policy');
    expect(body).toContain('/terms');
  });
});
