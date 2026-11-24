"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // global-error replaces the whole document, so the SDK's automatic
    // window.onerror capture may not have the React context for this render —
    // report it explicitly. A missing DSN makes this a no-op.
    Sentry.captureException(error);
    if (process.env.NODE_ENV === "production") {
      console.error("Global error:", error.message, error.digest);
    }
  }, [error]);

  return (
    <html>
      <head>
        <title>Something went wrong</title>
        <meta name="robots" content="noindex" />
        <style>{`
          body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; background: #0c0a09; color: #f6f0e6; }
          .error-container { max-width: 600px; margin: 2rem auto; background: #141211; border: 1px solid #292524; border-radius: 12px; padding: 2rem; }
          h1 { color: #ff6b1a; margin-bottom: 1rem; }
          p { color: #a8a29e; margin-bottom: 1.5rem; }
          button { background: #ff6b1a; color: #0c0a09; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-size: 1rem; cursor: pointer; font-weight: 600; }
          button:hover { background: #ea580c; }
        `}</style>
      </head>
      <body>
        <div className="error-container">
          <h1>Something went wrong</h1>
          <p>
            An unexpected error occurred. Please try again or contact support if
            the problem persists.
          </p>
          <button onClick={() => reset()}>Try again</button>
        </div>
      </body>
    </html>
  );
}
