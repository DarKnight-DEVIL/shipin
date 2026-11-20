import {
  serializeJsonLd,
  type JsonLdNode,
} from "@/lib/seo/structuredData";

/**
 * Renders structured data into the page.
 *
 * A server component with no state on purpose: the JSON-LD is then part of the
 * prerendered HTML a crawler receives, instead of being injected by client
 * JavaScript after hydration (which some crawlers never see).
 */
export default function JsonLd({
  data,
}: {
  data: JsonLdNode | readonly JsonLdNode[];
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
