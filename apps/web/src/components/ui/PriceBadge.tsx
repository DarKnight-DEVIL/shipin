"use client";

interface Props {
  price: number;
}

export default function PriceBadge({ price }: Props) {
  if (price === 0) {
    return (
      <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
        Free
      </span>
    );
  }

  return (
    <span className="text-[12px] font-semibold tabular-nums text-[var(--foreground)]">
      +${price}
    </span>
  );
}
