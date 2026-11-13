"use client";

export default function LoadingCard() {
  return (
    <div className="app-panel animate-pulse p-6">
      <div className="mb-5 h-5 w-44 rounded bg-[var(--surface-3)]" />

      <div className="space-y-3">
        <div className="h-3.5 rounded bg-[var(--surface-3)]" />
        <div className="h-3.5 w-5/6 rounded bg-[var(--surface-3)]" />
        <div className="h-3.5 w-2/3 rounded bg-[var(--surface-3)]" />
      </div>
    </div>
  );
}
