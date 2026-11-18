/**
 * Origin that serves the app when NEXT_PUBLIC_APP_URL is not configured.
 *
 * `https://shipin.co` is the intended domain but answers 410 Gone, so a build
 * that fell back to it emitted a sitemap, canonicals and OG URLs on a dead host.
 * Keep this in step with DEPLOYMENT.md → Domains and origins;
 * `npm run check:authorized-domains` reads this constant.
 */
export const SITE_URL_FALLBACK = 'https://shipin-psi.vercel.app';

/**
 * Canonical origin for metadata, sitemap and OG URLs.
 *
 * Trailing slashes and any path are dropped so callers can append `/route`; an
 * unparseable value falls back instead of throwing during a build.
 */
export function resolveSiteUrl(configured: string | undefined): string {
  const trimmed = configured?.trim();
  if (!trimmed) return SITE_URL_FALLBACK;

  try {
    return new URL(trimmed).origin;
  } catch {
    return SITE_URL_FALLBACK;
  }
}

export const SITE_CONFIG = {
  name: 'ShipIN',
  description: 'International Shopping Forwarding Platform',
  // Canonical origin: NEXT_PUBLIC_APP_URL when set (local dev, previews, and any
  // deployment that configures it), else SITE_URL_FALLBACK.
  url: resolveSiteUrl(process.env.NEXT_PUBLIC_APP_URL),
  supportEmail: 'support@shipin.co',
  social: {
    twitter: 'https://twitter.com/shipin',
    github: 'https://github.com/shipin',
  },
} as const;

export const ROUTES = {
  home: '/',
  login: '/login',
  dashboard: '/dashboard',
  requests: '/requests',
  tracking: '/track',
  verifyEmail: '/verify-email',
  admin: '/admin',
} as const;

export const API_ROUTES = {
  auth: {
    login: '/api/auth/login-intent',
    mfaStatus: '/api/auth/mfa/status',
  },
  tracking: '/api/tracking',
  requests: '/api/requests',
  paypal: '/api/paypal',
  support: '/api/support',
} as const;