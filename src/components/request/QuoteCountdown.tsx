"use client";

import { useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";
import {
  getRemainingTime,
} from "@/lib/quoteExpiry";

interface Props {
  expiresAt: Timestamp | Date | string;
}

export default function QuoteCountdown({
  expiresAt,
}: Props) {
  const [time, setTime] =
    useState(
      getRemainingTime(expiresAt)
    );

  useEffect(() => {
    const interval =
      setInterval(() => {
        setTime(
          getRemainingTime(expiresAt)
        );
      }, 1000);

    return () =>
      clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

      <h3 className="mb-3 font-semibold text-slate-950 dark:text-white">
        Quote Expires In
      </h3>

      <div className="text-4xl font-bold text-green-600 dark:text-green-400">
        {String(time.hours).padStart(2, "0")}:
        {String(time.minutes).padStart(2, "0")}:
        {String(time.seconds).padStart(2, "0")}
      </div>

    </div>
  );
}