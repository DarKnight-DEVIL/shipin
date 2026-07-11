"use client";

import type { Request } from "@/types/request";
import Section from "@/components/ui/Section";
import ProductCard from "../ProductCard";

interface Props {
  request: Request;
}

export default function ProductsPanel({
  request,
}: Props) {
  const items = request.items || [];
  console.log(request.items);
  return (
    <Section
      title="Products"
      subtitle={`${items.length} product${
        items.length !== 1 ? "s" : ""
      }`}
    >
      {items.length === 0 ? (
        <div className="text-slate-400">
          No products in this request.
        </div>
      ) : (
        <div className="space-y-6">
          {items.map(
            (item, index) => (
              <ProductCard
                key={index}
                item={item}
                editable
              />
            )
          )}
        </div>
      )}
    </Section>
  );
}