import { describe, expect, it } from 'vitest';

import sitemap from '@/app/sitemap';
import { siteConfig } from '@/config/site';
import { INDEXABLE_ROUTES, INDEX_ROBOTS, NOINDEX_ROBOTS, isIndexableRoute } from './seo';

describe('search-engine policy', () => {
  it('indexes only the public marketing and legal pages', () => {
    for (const route of INDEXABLE_ROUTES) {
      expect(isIndexableRoute(route), route).toBe(true);
    }

    for (const route of [
      '/login',
      '/requests',
      '/wallet',
      '/addresses',
      '/settings',
      '/notifications',
      '/support',
      '/dashboard',
      '/admin',
      '/verify-email',
      '/track/abc-123',
    ]) {
      expect(isIndexableRoute(route), route).toBe(false);
    }
  });

  it('lists exactly the indexable routes in the sitemap', () => {
    const paths = sitemap()
      .map((entry) => new URL(entry.url).pathname)
      .sort();

    expect(paths).toEqual([...INDEXABLE_ROUTES].sort());
  });

  it('builds every sitemap URL on the canonical origin', () => {
    for (const entry of sitemap()) {
      expect(entry.url.startsWith(`${siteConfig.url}/`), entry.url).toBe(true);
    }
  });

  it('ships robots directives that agree with the route policy', () => {
    expect(INDEX_ROBOTS.index).toBe(true);
    expect(NOINDEX_ROBOTS.index).toBe(false);
    expect(NOINDEX_ROBOTS.googleBot.index).toBe(false);
  });
});
