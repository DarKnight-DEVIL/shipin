export default function LoginSkeleton() {
  return (
    <main className="relative min-h-screen shipin-mesh flex items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-purple-500/15 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="shipin-card overflow-hidden p-8 md:p-10">
          <div className="mb-6 flex justify-center">
            <div className="h-7 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="mx-auto mb-3 h-9 w-36 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="mx-auto mb-2 h-4 w-64 max-w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mx-auto mb-8 h-4 w-48 max-w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-12 w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="mx-auto mt-6 h-3 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    </main>
  );
}