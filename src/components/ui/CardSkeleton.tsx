import Skeleton from "./Skeleton";

export default function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">

      <Skeleton className="h-6 w-44 mb-6" />

      <Skeleton className="h-5 w-full mb-3" />

      <Skeleton className="h-5 w-5/6 mb-3" />

      <Skeleton className="h-5 w-3/4" />

    </div>
  );
}