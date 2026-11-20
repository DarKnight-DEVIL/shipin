/**
 * JSON-LD builders for the public pages.
 *
 * Search engines read structured data from the prerendered HTML, so these are
 * plain objects rendered by a server component (`@/components/seo/JsonLd`).
 * The builders deliberately omit `@context`: the emitter adds it once and
 * wraps several nodes in an `@graph`, which is what Google recommends instead
 * of repeating `@context` in every script block.
 *
 * Everything here is derived from `siteConfig`, so a domain change (the app
 * used to advertise `shipin.co`, which answers 410 Gone) cannot leave a stale
 * URL behind in the markup.
 */
import { canonicalUrl } from "@/config/seo";
import { siteConfig } from "@/config/site";

export type JsonLdNode = Record<string, unknown>;

/** Canonical, slash-normalised origin used for every `@id` in the graph. */
const SITE_URL = canonicalUrl("/");
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/** The company behind the site: name, logo, postal address and support contact. */
export function organizationSchema(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: "ShipIN",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    image: `${SITE_URL}${siteConfig.ogImage}`,
    description: siteConfig.description,
    email: siteConfig.contact.email,
    telephone: siteConfig.contact.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: "4th Floor, Trade Center, Andheri East",
      addressLocality: "Mumbai",
      postalCode: "400069",
      addressCountry: "IN",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: siteConfig.contact.email,
        telephone: siteConfig.contact.phone,
        areaServed: "Worldwide",
        availableLanguage: ["en"],
      },
    ],
  };
}

/**
 * The site itself, tied to the organization. No `potentialAction`
 * SearchAction: tracking needs a shipped parcel's ID, so there is no useful
 * server-rendered search endpoint to advertise.
 */
export function websiteSchema(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: siteConfig.name,
    description: siteConfig.description,
    inLanguage: "en",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/** What ShipIN sells, so the landing page can surface as a service, not just a page. */
export function serviceSchema(): JsonLdNode {
  return {
    "@type": "Service",
    "@id": `${SITE_URL}/#service`,
    name: "International shopping and parcel forwarding",
    serviceType: "Parcel forwarding",
    url: SITE_URL,
    description:
      "Buy from Indian stores through ShipIN, have each parcel inspected and consolidated in Mumbai, then forwarded internationally with an upfront quote before purchase.",
    provider: { "@id": ORGANIZATION_ID },
    areaServed: [
      { "@type": "Country", name: "India" },
      { "@type": "Place", name: "Worldwide" },
    ],
  };
}

/** A single public page, linked back to the site node. */
export function webPageSchema({
  path,
  name,
  description,
}: {
  path: string;
  name: string;
  description: string;
}): JsonLdNode {
  const url = canonicalUrl(path);

  return {
    "@type": "WebPage",
    "@id": url,
    url,
    name,
    description,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORGANIZATION_ID },
  };
}

/** Home > current page, for the breadcrumb Google shows under a result. */
export function breadcrumbSchema(
  trail: readonly { name: string; path: string }[]
): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: canonicalUrl(crumb.path),
    })),
  };
}

/**
 * Serialises one node, or several as a single `@graph`, for a
 * `<script type="application/ld+json">` block.
 *
 * `<` is escaped to `\u003c`: a `</script>` inside any string (a description,
 * an address) would otherwise close the element and drop the rest of the
 * markup into the page. JSON parsers read the escape back as plain text.
 */
export function serializeJsonLd(data: JsonLdNode | readonly JsonLdNode[]): string {
  const payload: JsonLdNode = Array.isArray(data)
    ? { "@context": "https://schema.org", "@graph": data }
    : { "@context": "https://schema.org", ...data };

  return JSON.stringify(payload).replace(/</g, "\\u003c");
}
