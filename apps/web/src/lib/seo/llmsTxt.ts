/**
 * Builds `/llms.txt` — the llmstxt.org summary that tells language models which
 * pages of this site are public and worth reading.
 *
 * It is generated from `INDEXABLE_ROUTES` rather than written by hand so it
 * cannot advertise a page the proxy marks `noindex`. The description map is
 * typed as a `Record<IndexableRoute, …>`, so adding a route to that list
 * without describing it here fails the type check instead of shipping a gap.
 */
import { INDEXABLE_ROUTES, canonicalUrl, type IndexableRoute } from "@/config/seo";
import { siteConfig } from "@/config/site";

const ROUTE_SUMMARY: Record<
  IndexableRoute,
  { title: string; summary: string }
> = {
  "/": {
    title: "ShipIN home",
    summary:
      "What ShipIN does: buy from Indian stores, inspect and consolidate in Mumbai, forward worldwide, with an upfront quote.",
  },
  "/track": {
    title: "Track a shipment",
    summary:
      "Public tracking form. A visitor enters a ShipIN tracking ID to see dispatch, transit, customs and delivery status.",
  },
  "/privacy-policy": {
    title: "Privacy Policy",
    summary:
      "What personal data ShipIN collects, how it is used and shared (PayPal, email, WhatsApp, carriers), and how to exercise data rights.",
  },
  "/terms": {
    title: "Terms of Service",
    summary:
      "Eligibility, quotes and payment, shipping and customs duties, restricted items, liability and governing law.",
  },
};

export function buildLlmsTxt(): string {
  const pages = INDEXABLE_ROUTES.map((route) => {
    const { title, summary } = ROUTE_SUMMARY[route];
    return `- [${title}](${canonicalUrl(route)}): ${summary}`;
  });

  return [
    `# ${siteConfig.name}`,
    "",
    `> ${siteConfig.description}`,
    "",
    "ShipIN is an international shopping forwarding platform based in Mumbai, India. A customer submits a product link, ShipIN buys the item, inspects and consolidates the parcels, then forwards them internationally. Every quote is confirmed before purchase; there is no subscription.",
    "",
    "## Public pages",
    "",
    ...pages,
    "",
    "## Notes for language models",
    "",
    "- Only the pages listed above are public. Everything under /dashboard, /requests, /wallet, /settings and /admin needs an account and is deliberately marked noindex.",
    "- Prices, transit times and stock are quoted per request inside the signed-in app; this site publishes no price list or catalogue.",
    "- Crawlable index of the same URLs: " + canonicalUrl("/sitemap.xml"),
    "",
  ].join("\n");
}
