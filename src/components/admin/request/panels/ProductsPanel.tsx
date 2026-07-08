"use client";

import { Request } from "@/types/request";

import Section from "@/components/ui/Section";
import ProductCard from "../ProductCard";

interface Props {
  request: Request;
}

export default function ProductsPanel({
  request,
}: Props) {
  return (
    <Section
      title="Products"
      subtitle={`${request.items.length} item(s) in this request`}
    >
      {request.items.length === 0 ? (
        <p className="text-slate-400">
          No products found.
        </p>
      ) : (
        <div className="space-y-6">
          {request.items.map((item, index) => (
            <ProductCard
              key={index}
              item={item}
              editable
            />
          ))}
        </div>
      )}
    </Section>
  );
}