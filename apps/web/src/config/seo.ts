/**
 * Search-engine policy, in one place.
 *
 * The sitemap and the proxy used to disagree: the sitemap advertised `/requests`,
 * `/wallet`, `/settings` and friends, while the proxy sent `X-Robots-Tag:
 * noindex, nofollow` for everything except `/` and `/track`. A crawler believes
 * the header, so Search Console reported every one of those URLs as "Excluded by
 * noindex tag" even though the sitemap kept submitting them.
 *
 * A route is indexable only if it is a public marketing/legal page. Everything
 * under the signed-in app is private: it has no value in search results and its
 * prerendered shell is not something to surface. Adding a page to
 * `INDEXABLE_ROUTES` is the single change that makes the sitemap list it *and*
 * the proxy mark it `index, follow`; the page's own metadata should use
 * `INDEX_ROBOTS`. The root layout defaults to `NOINDEX_ROBOTS` so a new private
 * page inherits the same answer in both places without anyone remembering to
 * opt in.
 */

/** Public routes a crawler may index, and the sitemap may advertise. */
export const INDEXABLE_ROUTES = ['/', '/track', '/privacy-policy', '/terms'] as const;

export type IndexableRoute = (typeof INDEXABLE_ROUTES)[number];

/**
 * Exact match on purpose: `/track` is indexable, but `/track/<id>` is a
 * customer's shipment and must not be — the same rule robots.txt applies to
 * `/verify-email/`.
 */
export function isIndexableRoute(pathname: string): boolean {
  return (INDEXABLE_ROUTES as readonly string[]).includes(pathname);
}

/** Metadata for a public, indexable page. */
export const INDEX_ROBOTS = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
    'max-video-preview': -1,
  },
} as const;

/**
 * Metadata for a signed-in page. The root layout uses this as its default so a
 * page cannot be indexable by omission.
 */
export const NOINDEX_ROBOTS = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
} as const;
