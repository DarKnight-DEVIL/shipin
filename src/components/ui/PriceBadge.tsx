"use client";

interface Props {
  price: number;
}

export default function PriceBadge({
  price,
}: Props) {
  if (price === 0) {
    return (
      <span className="text-green-400 font-semibold">
        FREE
      </span>
    );
  }

  return (
    <span className="text-purple-400 font-semibold">
      +${price}
    </span>
  );
}