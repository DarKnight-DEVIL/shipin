/**
 * Root loading state.
 *
 * Next streams this while a route's server work is still in flight, so the
 * page never appears frozen. `role="status"` + `aria-live` means assistive
 * tech announces it, and the reduced-motion rule in globals disables the pulse.
 */
export default function Loading() {
  return (
    <main
      className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 animate-pulse" />
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        </div>

        <div className="space-y-3">
          <div className="h-7 w-3/4 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
          <div className="h-4 w-full rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
          <div className="h-4 w-5/6 rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-gray-900 animate-pulse" />
        </div>

        <div className="mt-8 h-11 w-40 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />

        <span className="sr-only">Loading page…</span>
      </div>
    </main>
  );
}
