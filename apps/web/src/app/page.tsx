import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';

/**
 * Landing page metadata.
 * This route is a server component so Next can resolve page-level open graph /
 * title metadata. The interactive UI lives in LandingShell.
 */

export const metadata: Metadata = {
  title: {
    default: 'ShipIN — International Shopping Forwarding Platform',
    template: '%s | ShipIN',
  },
  description:
    'ShipIN lets global shoppers forward parcels from India and overseas to their doorstep. Inspect, pack, and forward purchases from marketplaces, stores, and warehouses worldwide.',
  keywords: [
    'international shipping forwarding',
    'parcel forwarding India',
    'shopping forwarding service',
    'ShipIN',
    'global parcel delivery',
  ],
  authors: [{ name: 'ShipIN', url: siteConfig.url }],
  openGraph: {
    title: 'ShipIN — International Shopping Forwarding Platform',
    description:
      'Forward international purchases from India and overseas to your address worldwide. Inspect, repack, and ship with ShipIN.',
    type: 'website',
    locale: 'en_IN',
    url: siteConfig.url,
    siteName: siteConfig.name,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: 'ShipIN — International Shipping Forwarding',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ShipIN — International Shopping Forwarding Platform',
    description:
      'Forward international purchases from India and overseas to your address worldwide.',
    images: [siteConfig.ogImage],
    creator: siteConfig.twitterHandle,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

import LandingShell from './_landing/LandingShell';

export default function HomePage() {
  return <LandingShell />;
}
