"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to monitoring service in production
    if (process.env.NODE_ENV === "production") {
      console.error("Route error:", error.message, error.digest);
    }
  }, [error]);

  return (
    <div style={{
      fontFamily: "system-ui, sans-serif",
      textAlign: "center",
      padding: "2rem",
      maxWidth: "600px",
      margin: "2rem auto",
      background: "white",
      borderRadius: "12px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    }}>
      <h1 style={{ color: "#dc2626", marginBottom: "1rem" }}>Something went wrong</h1>
      <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
        An error occurred while loading this page. Please try again or contact support if the problem persists.
      </p>
      <button
        onClick={() => reset()}
        style={{
          background: "#7c3aed",
          color: "white",
          border: "none",
          padding: "0.75rem 1.5rem",
          borderRadius: "8px",
          fontSize: "1rem",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}