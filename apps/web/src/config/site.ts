import { SITE_CONFIG } from '@shipin/config';

/**
 * Site-wide configuration constants.
 *
 * Brand name, description and the support address come from `@shipin/config`
 * so the app and the shared workspace packages cannot drift apart. The
 * canonical URL and the Open Graph asset are specific to this app.
 */

export const siteConfig = {
  name: SITE_CONFIG.name,
  description: SITE_CONFIG.description,
  url: 'https://shipin.co',
  // PNG: social platforms (Facebook, LinkedIn, X, WhatsApp, Slack) do not
  // render SVG preview images, so the raster version is the shareable one.
  ogImage: '/og-image.png',
  twitterHandle: '@shipin',
  contact: {
    email: SITE_CONFIG.supportEmail,
    address: 'ShipIN, 4th Floor, Trade Center, Andheri East, Mumbai 400069, India',
    phone: '+91 22 6823 4567',
  },
} as const;

export type SiteConfig = typeof siteConfig;
