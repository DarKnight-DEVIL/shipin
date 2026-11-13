export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'] as const;
export const COUNTRIES = ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'JP', 'IN', 'BR', 'MX'] as const;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] as const;

export const SHIPPING_STATUSES = [
  'quote_requested',
  'quote_ready',
  'quote_accepted',
  'payment_pending',
  'payment_completed',
  'processing',
  'shipped',
  'in_transit',
  'customs_clearance',
  'delivered',
  'cancelled',
  'refunded',
] as const;

export type ShippingStatus = typeof SHIPPING_STATUSES[number];