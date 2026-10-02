import Skeleton from "./Skeleton";
import CardSkeleton from "./CardSkeleton";

export default function PageSkeleton() {
  return (
    <div className="space-y-8">

      <Skeleton className="h-10 w-72" />

      <div className="grid gap-6">

        <CardSkeleton />

        <CardSkeleton />

        <CardSkeleton />

      </div>

    </div>
  );
}