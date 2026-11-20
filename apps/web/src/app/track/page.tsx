import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { INDEX_ROBOTS, canonicalUrl } from "@/config/seo";

/**
 * Tracking search page metadata.
 */

export const metadata: Metadata = {
  title: "Track Your Shipment",
  alternates: { canonical: canonicalUrl("/track") },
  robots: INDEX_ROBOTS,
  description:
    "Track your ShipIN shipment by entering your tracking ID. Get live updates on dispatch, transit, customs, and delivery status.",
  openGraph: {
    title: "Track Your Shipment | ShipIN",
    description:
      "Track your ShipIN shipment by entering your tracking ID. Get live updates on dispatch, transit, customs, and delivery status.",
    type: "website",
    url: `${siteConfig.url}/track`,
    siteName: siteConfig.name,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: "Track your shipment with ShipIN",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Track Your Shipment | ShipIN",
    description:
      "Track your ShipIN shipment by entering your tracking ID. Get live updates on dispatch, transit, customs, and delivery status.",
    images: [siteConfig.ogImage],
    creator: siteConfig.twitterHandle,
  },
};

import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema, webPageSchema } from "@/lib/seo/structuredData";
import TrackShell from "./TrackShell";

export default function TrackPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            path: "/track",
            name: "Track Your Shipment",
            description:
              "Track a ShipIN shipment with its tracking ID and see live dispatch, transit, customs and delivery status.",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Track Your Shipment", path: "/track" },
          ]),
        ]}
      />
      <TrackShell />
    </>
  );
}
