import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';

/**
 * Tracking result page metadata.
 */

export const metadata: Metadata = {
  title: 'Track Shipment',
  description:
    'View the latest status of your ShipIN shipment, including dispatch, transit, customs, and delivery updates.',
  openGraph: {
    title: 'Track Shipment | ShipIN',
    description:
      'View the latest status of your ShipIN shipment, including dispatch, transit, customs, and delivery updates.',
    type: 'website',
    url: `${siteConfig.url}/track`,
    siteName: siteConfig.name,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: 'ShipIN shipment tracking',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Track Shipment | ShipIN',
    description:
      'View the latest status of your ShipIN shipment, including dispatch, transit, customs, and delivery updates.',
    images: [siteConfig.ogImage],
    creator: siteConfig.twitterHandle,
  },
};

import TrackingShell from './TrackingShell';

/**
 * Tracking result page.
 * This route is a server component so Next can resolve page metadata. The UI
 * itself is client-side and lives in TrackingShell.
 */

export default function TrackingResultPage() {
  return <TrackingShell />;
}
