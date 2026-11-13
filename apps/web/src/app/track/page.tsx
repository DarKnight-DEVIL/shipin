import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';

/**
 * Tracking search page metadata.
 */

export const metadata: Metadata = {
  title: 'Track Your Shipment',
  description:
    'Track your ShipIN shipment by entering your tracking ID. Get live updates on dispatch, transit, customs, and delivery status.',
  openGraph: {
    title: 'Track Your Shipment | ShipIN',
    description:
      'Track your ShipIN shipment by entering your tracking ID. Get live updates on dispatch, transit, customs, and delivery status.',
    type: 'website',
    url: `${siteConfig.url}/track`,
    siteName: siteConfig.name,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: 'Track your shipment with ShipIN',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Track Your Shipment | ShipIN',
    description:
      'Track your ShipIN shipment by entering your tracking ID. Get live updates on dispatch, transit, customs, and delivery status.',
    images: [siteConfig.ogImage],
    creator: siteConfig.twitterHandle,
  },
};

import TrackShell from './TrackShell';

export default function TrackPage() {
  return <TrackShell />;
}
