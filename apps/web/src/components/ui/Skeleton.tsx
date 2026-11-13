interface Props {
  className?: string;
}

export default function Skeleton({ className = "" }: Props) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[var(--surface-3)] ${className}`}
    />
  );
}
