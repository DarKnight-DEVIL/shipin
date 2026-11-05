/**
 * Formatting utilities for currency, dates, and text.
 */

/** Format a number as USD currency. */
export function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/** Format a Firestore timestamp or Date to a readable string. */
export function formatDate(
  timestamp: { toMillis?: () => number } | Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!timestamp) return 'N/A';

  let date: Date;
  if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp.toMillis === 'function') {
    date = new Date(timestamp.toMillis());
  } else {
    return 'N/A';
  }

  if (Number.isNaN(date.getTime())) return 'N/A';

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(date);
}

/** Format a date as a relative string (e.g., "2 days ago"). */
export function formatRelativeTime(
  timestamp: { toMillis?: () => number } | Date | string | null | undefined
): string {
  if (!timestamp) return '';

  let date: Date;
  if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp.toMillis === 'function') {
    date = new Date(timestamp.toMillis());
  } else {
    return '';
  }

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return formatDate(date);
}

/** Truncate text with an ellipsis. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/** Format a phone number for display. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/** Convert a tracking number to a short display format. */
export function formatTrackingId(id: string): string {
  if (id.length <= 8) return id.toUpperCase();
  return `${id.slice(0, 4).toUpperCase()}...${id.slice(-4).toUpperCase()}`;
}