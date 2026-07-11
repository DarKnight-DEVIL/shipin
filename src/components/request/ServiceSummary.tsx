"use client";

import SectionCard from "@/components/ui/SectionCard";
import { PRICING } from "@/config/pricing";

type Inspection = "none" | "standard" | "detailed";
type Shipping = "auto" | "approval" | "hold";

interface Props {
  inspection: Inspection;
  shipping: Shipping;
}

export default function ServiceSummary({
  inspection,
  shipping,
}: Props) {
  const inspectionService = PRICING.inspection[inspection];
  const shippingService = PRICING.shipping[shipping];

  const total =
    inspectionService.price + shippingService.price;

  return (
    <SectionCard
      title="Selected Services"
      subtitle="Review your selected package handling options"
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-white">Inspection</p>
            <p className="text-sm text-slate-400">
              {inspectionService.name}
            </p>
          </div>

          <span className="font-semibold text-white">
            {inspectionService.price === 0
              ? "FREE"
              : `+$${inspectionService.price}`}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-white">Shipping Preference</p>
            <p className="text-sm text-slate-400">
              {shippingService.name}
            </p>
          </div>

          <span className="font-semibold text-white">
            {shippingService.price === 0
              ? "FREE"
              : `+$${shippingService.price}`}
          </span>
        </div>

        <hr className="border-slate-700" />

        <div className="flex items-center justify-between text-lg font-bold">
          <span className="text-white">Additional Charges</span>

          <span className="text-purple-400">
            {total === 0 ? "FREE" : `+$${total}`}
          </span>
        </div>
      </div>
    </SectionCard>
  );
}