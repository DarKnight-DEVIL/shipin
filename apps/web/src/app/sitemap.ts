import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { INDEXABLE_ROUTES, type IndexableRoute } from "@/config/seo";

type ChangeFrequency =
  "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

/**
 * Crawl hints per public route. The list itself lives in `@/config/seo` so the
 * sitemap cannot advertise a URL the proxy marks `noindex` — that mismatch is
 * reported by Search Console as "Excluded by noindex tag" for URLs the sitemap
 * keeps submitting.
 */
const ROUTE_META: Record<
  IndexableRoute,
  { changeFrequency: ChangeFrequency; priority: number; lastModified: string }
> = {
  "/": { changeFrequency: "weekly", priority: 1, lastModified: "2026-11-01" },
  "/track": {
    changeFrequency: "weekly",
    priority: 0.8,
    lastModified: "2026-11-01",
  },
  "/privacy-policy": {
    changeFrequency: "monthly",
    priority: 0.7,
    lastModified: "2026-09-01",
  },
  "/terms": {
    changeFrequency: "monthly",
    priority: 0.7,
    lastModified: "2026-09-01",
  },
  "/refund-policy": {
    changeFrequency: "monthly",
    priority: 0.6,
    lastModified: "2026-11-20",
  },
  "/cookie-policy": {
    changeFrequency: "monthly",
    priority: 0.6,
    lastModified: "2026-11-20",
  },
  "/licences": {
    changeFrequency: "yearly",
    priority: 0.4,
    lastModified: "2026-11-20",
  },
};

/**
 * `lastModified` is a fixed per-route date, bumped when that page's content
 * changes. `new Date()` stamped every build, so every deploy claimed all four
 * pages had changed — noise, and crawlers discount lastmod values that move
 * without content changes.
 */

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url;

  // Private pages (`/login`, `/requests`, `/wallet`, `/addresses`, `/settings`,
  // `/notifications`, `/support`) are deliberately absent: the proxy and their
  // metadata both mark them `noindex`, and `robots.txt` blocks `/admin/`.
  return INDEXABLE_ROUTES.map((route) => ({
    url: `${base}${route}`,
    ...ROUTE_META[route],
    lastModified: new Date(`${ROUTE_META[route].lastModified}T00:00:00.000Z`),
  }));
}
