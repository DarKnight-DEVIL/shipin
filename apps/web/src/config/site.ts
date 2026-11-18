import { SITE_CONFIG } from "@shipin/config";

/**
 * Site-wide configuration constants.
 *
 * Brand name, description and the support address come from `@shipin/config`
 * so the app and the shared workspace packages cannot drift apart.
 *
 * The canonical URL is `NEXT_PUBLIC_APP_URL` at build time, falling back to the
 * host that currently serves the app (`https://shipin-psi.vercel.app`). It used
 * to be hardcoded to `https://shipin.co`, which answers 410 Gone — so every
 * sitemap entry, canonical link and OG image URL pointed at a dead domain.
 * `@shipin/config` owns the value; this file only re-exports it so app code has
 * one import site.
 */

export const siteConfig = {
  name: SITE_CONFIG.name,
  description: SITE_CONFIG.description,
  url: SITE_CONFIG.url,
  // PNG: social platforms (Facebook, LinkedIn, X, WhatsApp, Slack) do not
  // render SVG preview images, so the raster version is the shareable one.
  ogImage: "/og-image.png",
  twitterHandle: "@shipin",
  contact: {
    email: SITE_CONFIG.supportEmail,
    address:
      "ShipIN, 4th Floor, Trade Center, Andheri East, Mumbai 400069, India",
    phone: "+91 22 6823 4567",
  },
} as const;

export type SiteConfig = typeof siteConfig;
