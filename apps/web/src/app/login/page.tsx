import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';
import { Suspense } from "react";
import LoginClient from "./LoginClient";
import "@/styles/login.css";

/**
 * Login page metadata.
 */

export const metadata: Metadata = {
  title: 'Sign in',
  description:
    'Sign in to your ShipIN account to manage requests, track shipments, and access your forwarding dashboard.',
  openGraph: {
    title: 'Sign in to ShipIN',
    description:
      'Sign in to your ShipIN account to manage requests, track shipments, and access your forwarding dashboard.',
    type: 'website',
    url: `${siteConfig.url}/login`,
    siteName: siteConfig.name,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: 'ShipIN — Sign in',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sign in to ShipIN',
    description:
      'Sign in to your ShipIN account to manage requests, track shipments, and access your forwarding dashboard.',
    images: [siteConfig.ogImage],
    creator: siteConfig.twitterHandle,
  },
};

export default function LoginPage() {
  // The fallback is just the themed dark background, so there is no flash of a
  // different style while the client component loads.
  return (
    <Suspense fallback={<main className="login login--boot" aria-busy="true" />}>
      <LoginClient />
    </Suspense>
  );
}