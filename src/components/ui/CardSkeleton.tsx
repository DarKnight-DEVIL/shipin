import Skeleton from "./Skeleton";

export default function CardSkeleton() {
  return (
    <div className="app-panel p-5">
      <Skeleton className="mb-5 h-4 w-40" />
      <Skeleton className="mb-2.5 h-3.5 w-full" />
      <Skeleton className="mb-2.5 h-3.5 w-5/6" />
      <Skeleton className="h-3.5 w-3/4" />
    </div>
  );
}
