import * as Sentry from '@sentry/nextjs';
import type { ErrorEvent, EventHint } from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  // Server-side error filtering
  beforeSend(event: ErrorEvent, _hint: EventHint) {
    // Filter out common non-actionable server errors
    if (event.exception) {
      for (const exception of event.exception.values || []) {
        if (exception.type === 'ECONNRESET' || exception.type === 'ETIMEDOUT') {
          // Network issues - usually transient
          return null;
        }
      }
    }
    return event;
  },
});