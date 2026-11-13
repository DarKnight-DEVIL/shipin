/**
 * Loading state for the authenticated platform shell (dashboard, requests,
 * wallet, addresses, settings…). Mirrors the stat-card + list layout so the
 * transition doesn't jump when the real content arrives.
 */
export default function PlatformLoading() {
  return (
    <div
      className="space-y-6 p-4 sm:p-6 lg:p-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-4 w-80 max-w-full rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-200 dark:border-gray-800 p-5"
          >
            <div className="h-3 w-20 rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
            <div className="mt-4 h-7 w-24 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
            <div className="mt-3 h-3 w-16 rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 dark:border-gray-800 p-5">
          <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-900">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-5">
              <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
              </div>
              <div className="h-6 w-16 rounded-full bg-gray-100 dark:bg-gray-900 animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading your dashboard…</span>
    </div>
  );
}
