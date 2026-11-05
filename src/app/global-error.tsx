"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to monitoring service in production
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
          body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; background: #fafafa; color: #111; }
          .error-container { max-width: 600px; margin: 2rem auto; background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          h1 { color: #dc2626; margin-bottom: 1rem; }
          p { color: #6b7280; margin-bottom: 1.5rem; }
          button { background: #7c3aed; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-size: 1rem; cursor: pointer; }
          button:hover { background: #6d28d9; }
        `}</style>
      </head>
      <body>
        <div className="error-container">
          <h1>Something went wrong</h1>
          <p>An unexpected error occurred. Please try again or contact support if the problem persists.</p>
          <button onClick={() => reset()}>Try again</button>
        </div>
      </body>
    </html>
  );
}