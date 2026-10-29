import Skeleton from "./Skeleton";
import CardSkeleton from "./CardSkeleton";

export default function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid gap-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
