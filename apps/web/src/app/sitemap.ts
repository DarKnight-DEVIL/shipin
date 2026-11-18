import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';
import { INDEXABLE_ROUTES, type IndexableRoute } from '@/config/seo';

type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

/**
 * Crawl hints per public route. The list itself lives in `@/config/seo` so the
 * sitemap cannot advertise a URL the proxy marks `noindex` — that mismatch is
 * reported by Search Console as "Excluded by noindex tag" for URLs the sitemap
 * keeps submitting.
 */
const ROUTE_META: Record<
  IndexableRoute,
  { changeFrequency: ChangeFrequency; priority: number }
> = {
  '/': { changeFrequency: 'weekly', priority: 1 },
  '/track': { changeFrequency: 'weekly', priority: 0.8 },
  '/privacy-policy': { changeFrequency: 'monthly', priority: 0.7 },
  '/terms': { changeFrequency: 'monthly', priority: 0.7 },
};

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url;
  const now = new Date();

  // Private pages (`/login`, `/requests`, `/wallet`, `/addresses`, `/settings`,
  // `/notifications`, `/support`) are deliberately absent: the proxy and their
  // metadata both mark them `noindex`, and `robots.txt` blocks `/admin/`.
  return INDEXABLE_ROUTES.map((route) => ({
    url: `${base}${route}`,
    lastModified: now,
    ...ROUTE_META[route],
  }));
}
