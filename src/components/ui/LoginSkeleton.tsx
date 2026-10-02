import Skeleton from "./Skeleton";

export default function LoginSkeleton() {
  return (
    <div className="max-w-md mx-auto mt-20 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">

      <Skeleton className="h-8 w-40 mb-8" />

      <Skeleton className="h-12 w-full mb-4" />

      <Skeleton className="h-12 w-full mb-6" />

      <Skeleton className="h-12 w-full" />

    </div>
  );
}