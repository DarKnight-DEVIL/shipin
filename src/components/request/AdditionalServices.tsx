"use client";

import { PackageSearch, Truck } from "lucide-react";
import SelectionCard from "@/components/ui/SelectionCard";
import SectionCard from "@/components/ui/SectionCard";
import InfoNotice from "@/components/ui/InfoNotice";

interface Props {
  inspection: "none" | "standard" | "detailed";
  shipping: "auto" | "approval" | "hold";
  onInspectionChange: (value: "none" | "standard" | "detailed") => void;
  onShippingChange: (value: "auto" | "approval" | "hold") => void;
}

export default function AdditionalServices({
  inspection,
  shipping,
  onInspectionChange,
  onShippingChange,
}: Props) {
  return (
    <SectionCard
      title="Additional services"
      subtitle="Customize how ShipIN handles your package."
    >
      <div className="space-y-8">
        {/* Inspection */}
        <div>
          <div className="mb-4 flex items-center gap-2">
            <PackageSearch
              size={18}
              className="text-purple-600 dark:text-purple-400"
            />
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">
              Inspection
            </h3>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <SelectionCard
              title="No inspection"
              description="Package stays sealed and ships without opening."
              price={0}
              selected={inspection === "none"}
              onClick={() => {
                onInspectionChange("none");
                if (shipping === "approval") onShippingChange("auto");
              }}
            />

            <SelectionCard
              title="Standard inspection"
              description="Verify the correct item."
              price={0}
              selected={inspection === "standard"}
              onClick={() => {
                onInspectionChange("standard");
                if (shipping === "auto") onShippingChange("approval");
              }}
            />

            <SelectionCard
              title="Detailed inspection"
              description="Multiple photos, accessories checked, and damage check."
              price={5}
              selected={inspection === "detailed"}
              onClick={() => {
                onInspectionChange("detailed");
                if (shipping === "auto") onShippingChange("approval");
              }}
            />
          </div>
        </div>

        {/* Shipping preference */}
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Truck size={18} className="text-purple-600 dark:text-purple-400" />
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">
              Shipping preference
            </h3>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <SelectionCard
              title="Auto ship"
              description="Ship immediately after warehouse processing."
              price={0}
              selected={shipping === "auto"}
              disabled={inspection !== "none"}
              onClick={() => onShippingChange("auto")}
            />

            <SelectionCard
              title="Wait for approval"
              description="Inspection photos are uploaded before shipping."
              price={0}
              selected={shipping === "approval"}
              disabled={inspection === "none"}
              onClick={() => onShippingChange("approval")}
            />

            <SelectionCard
              title="Hold package"
              description="Store securely until you ask us to ship."
              price={5}
              selected={shipping === "hold"}
              onClick={() => onShippingChange("hold")}
            />
          </div>
        </div>

        <InfoNotice variant="info">
          <p className="font-medium">Shipping rules</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>• Wait for approval requires Standard or Detailed inspection.</li>
            <li>• Auto ship is only available with No inspection.</li>
            <li>
              • Hold package stores your shipment until you give the go-ahead
              for international shipping.
            </li>
          </ul>
        </InfoNotice>
      </div>
    </SectionCard>
  );
}