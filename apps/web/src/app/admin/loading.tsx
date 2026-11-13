/**
 * Loading state for the admin surface. Admin pages pull larger query sets
 * (audit feeds, warehouse inventory, purchase queues), so the skeleton mirrors
 * a table rather than the customer-facing card grid.
 */
export default function AdminLoading() {
  return (
    <div
      className="space-y-6 p-4 sm:p-6 lg:p-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
          <div className="h-3 w-64 rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
        </div>
        <div className="h-10 w-32 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="grid grid-cols-4 gap-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-800 animate-pulse"
            />
          ))}
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-900">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-4 gap-4 p-4">
              {Array.from({ length: 4 }).map((__, j) => (
                <div
                  key={j}
                  className="h-4 rounded bg-gray-100 dark:bg-gray-900 animate-pulse"
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading admin data…</span>
    </div>
  );
}
