/**
 * Guards the sitemap's hand-maintained metadata.
 *
 * The dates are fixed on purpose (see `ROUTE_META` in `./sitemap`): a `new
 * Date()` stamp made every deploy claim every page had changed, which crawlers
 * discount. The cost of that choice is that the table is edited by hand, so
 * these tests pin the two mechanical failure modes — a route the sitemap
 * advertises but has no metadata for (which would emit `undefined` fields), and
 * a malformed date.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  isProduction: true,
  clientEnv: {
    NEXT_PUBLIC_APP_URL: "https://shipin.example",
    NEXT_PUBLIC_FIREBASE_API_KEY: "test",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "test",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "test-bucket",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456:web:abcdef",
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: "test",
    NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: "",
    NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG: "",
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: "",
    NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: "",
  },
  serverEnv: {},
}));

import sitemap from "./sitemap";
import { INDEXABLE_ROUTES } from "@/config/seo";

const entries = sitemap();

describe("sitemap", () => {
  it("publishes exactly the indexable routes", () => {
    const urls = entries.map((entry) => entry.url);

    expect(urls).toHaveLength(INDEXABLE_ROUTES.length);
    for (const route of INDEXABLE_ROUTES) {
      expect(urls.some((url) => url.endsWith(route))).toBe(true);
    }
  });

  it("gives every entry a real date, not one derived from the build clock", () => {
    // A build-time stamp is what this table exists to avoid; a date in the
    // future means someone typed the year wrong and the crawler ignores it.
    const now = Date.now();

    for (const entry of entries) {
      expect(entry.lastModified).toBeInstanceOf(Date);
      const stamp = (entry.lastModified as Date).getTime();
      expect(Number.isNaN(stamp)).toBe(false);
      expect(stamp).toBeLessThanOrEqual(now);
    }
  });

  it("never advertises a private route", () => {
    const privatePaths = [
      "/login",
      "/requests",
      "/wallet",
      "/addresses",
      "/settings",
      "/notifications",
      "/support",
      "/admin",
    ];

    for (const entry of entries) {
      for (const path of privatePaths) {
        expect(entry.url).not.toContain(`${path}`);
      }
    }
  });
});
