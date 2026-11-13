export const SITE_CONFIG = {
  name: 'ShipIN',
  description: 'International Shopping Forwarding Platform',
  // Canonical deployment: shipin-psi.vercel.app. Local dev sets NEXT_PUBLIC_APP_URL.
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://shipin.co',
  supportEmail: 'support@shipin.co',
  social: {
    twitter: 'https://twitter.com/shipin',
    github: 'https://github.com/shipin',
  },
} as const;

export const ROUTES = {
  home: '/',
  login: '/login',
  dashboard: '/dashboard',
  requests: '/requests',
  tracking: '/track',
  verifyEmail: '/verify-email',
  admin: '/admin',
} as const;

export const API_ROUTES = {
  auth: {
    login: '/api/auth/login-intent',
    mfaStatus: '/api/auth/mfa/status',
  },
  tracking: '/api/tracking',
  requests: '/api/requests',
  paypal: '/api/paypal',
  support: '/api/support',
} as const;