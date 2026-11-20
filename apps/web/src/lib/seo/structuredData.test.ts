import { describe, expect, it } from "vitest";
import { canonicalUrl } from "@/config/seo";
import {
  breadcrumbSchema,
  organizationSchema,
  serializeJsonLd,
  serviceSchema,
  webPageSchema,
  websiteSchema,
} from "./structuredData";

const parse = (json: string) => JSON.parse(json) as Record<string, unknown>;

describe("structured data nodes", () => {
  it("identifies the organization with an absolute logo and the site origin", () => {
    const node = organizationSchema();

    expect(node["@type"]).toBe("Organization");
    expect(node["@id"]).toBe(`${canonicalUrl("/")}/#organization`);
    expect(node.logo).toBe(`${canonicalUrl("/")}/icons/icon-512.png`);
    expect(String(node.image)).toMatch(/^https:\/\/.+og-image\.png$/);
  });

  it("ties the website and the service back to the organization", () => {
    const organizationId = organizationSchema()["@id"];

    expect(websiteSchema().publisher).toEqual({ "@id": organizationId });
    expect(serviceSchema().provider).toEqual({ "@id": organizationId });
    expect(webPageSchema({ path: "/track", name: "x", description: "y" }).isPartOf).toEqual(
      { "@id": `${canonicalUrl("/")}/#website` }
    );
  });

  it("normalises trailing slashes into one canonical page URL", () => {
    const node = webPageSchema({
      path: "/privacy-policy/",
      name: "Privacy Policy",
      description: "How data is handled.",
    });

    expect(node.url).toBe(canonicalUrl("/privacy-policy"));
    expect(node["@id"]).toBe(node.url);
  });

  it("numbers breadcrumb entries from 1 in trail order", () => {
    const node = breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Terms of Service", path: "/terms" },
    ]);

    expect(node.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: canonicalUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Terms of Service",
        item: canonicalUrl("/terms"),
      },
    ]);
  });
});

describe("serializeJsonLd", () => {
  it("adds a single @context to one node", () => {
    const payload = parse(serializeJsonLd(webPageSchema({ path: "/", name: "a", description: "b" })));

    expect(payload["@context"]).toBe("https://schema.org");
    expect(payload["@type"]).toBe("WebPage");
  });

  it("wraps several nodes in one @graph with one @context", () => {
    const payload = parse(
      serializeJsonLd([organizationSchema(), websiteSchema(), serviceSchema()])
    );

    expect(payload["@context"]).toBe("https://schema.org");
    const graph = payload["@graph"] as Record<string, unknown>[];
    expect(graph.map((node) => node["@type"])).toEqual([
      "Organization",
      "WebSite",
      "Service",
    ]);
    // The context lives on the wrapper only, not on every node.
    expect(graph.every((node) => !("@context" in node))).toBe(true);
  });

  it("escapes '<' so a description cannot close the script element", () => {
    const json = serializeJsonLd(
      webPageSchema({
        path: "/",
        name: "ShipIN",
        description: "Forwarding <script>alert(1)</script> parcels",
      })
    );

    expect(json).not.toContain("</script>");
    expect(json).toContain("\\u003cscript");
    // Still valid JSON, and reads back as the original text.
    expect(parse(json).description).toBe(
      "Forwarding <script>alert(1)</script> parcels"
    );
  });
});
