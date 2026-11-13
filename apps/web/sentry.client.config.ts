import * as Sentry from '@sentry/nextjs';
import type { ErrorEvent, EventHint } from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Only enable in production
  enabled: process.env.NODE_ENV === 'production',
  // Adjust sample rate in production
  tracesSampleRate: 0.1,
  // Set environment
  environment: process.env.NODE_ENV,
  // Capture unhandled rejections
  beforeSend(event: ErrorEvent, _hint: EventHint) {
    // Filter out known non-actionable errors
    if (event.exception) {
      for (const exception of event.exception.values || []) {
        if (exception.type === 'ChunkLoadError') {
          // Network errors loading chunks - usually transient
          return null;
        }
        if (exception.type === 'ResizeObserver Loop completed with undefined elements') {
          // Benign browser warning
          return null;
        }
      }
    }
    return event;
  },
});