"use client";

import { useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { getRemainingTime, isQuoteExpired } from "@/lib/quoteExpiry";

interface Props {
  expiresAt: Timestamp | Date | string;
}

export default function QuoteCountdown({ expiresAt }: Props) {
  const [time, setTime] = useState(() => getRemainingTime(expiresAt));

  useEffect(() => {
    // Immediate recompute in case expiresAt changed
    setTime(getRemainingTime(expiresAt));

    if (isQuoteExpired(expiresAt)) return;

    const interval = setInterval(() => {
      const next = getRemainingTime(expiresAt);
      setTime(next);
      if (next.expired) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  // Hide entirely when expired or no meaningful time left
  if (time.expired || time.totalMs <= 0) {
    return null;
  }

  const urgent = time.totalMs < 3600_000; // under 1 hour

  return (
    <div className="shipin-surface px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="shipin-section-label">Quote expires in</p>
        <p
          className={`font-mono text-xl font-semibold tracking-tight ${
            urgent ? "text-amber-400" : "text-emerald-500"
          }`}
        >
          {String(time.hours).padStart(2, "0")}:
          {String(time.minutes).padStart(2, "0")}:
          {String(time.seconds).padStart(2, "0")}
        </p>
      </div>
    </div>
  );
}