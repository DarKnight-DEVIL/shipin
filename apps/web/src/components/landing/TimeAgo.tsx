"use client";

import { formatTimeAgo } from "./formatTimeAgo";

export default function TimeAgo({ date }: { date: string }) {
  return <span suppressHydrationWarning>{formatTimeAgo(date)}</span>;
}