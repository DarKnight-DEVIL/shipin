"use client";

import SelectionCard from "@/components/ui/SelectionCard";
import SectionCard from "@/components/ui/SectionCard";
import InfoNotice from "@/components/ui/InfoNotice";

interface Props {
  inspection: "none" | "standard" | "detailed";
  shipping: "auto" | "approval" | "hold";

  onInspectionChange: (
    value: "none" | "standard" | "detailed"
  ) => void;

  onShippingChange: (
    value: "auto" | "approval" | "hold"
  ) => void;
}

export default function AdditionalServices({
  inspection,
  shipping,
  onInspectionChange,
  onShippingChange,
}: Props) {
  return (
    <SectionCard
      title="Additional Services"
      subtitle="Customize how ShipIN handles your package."
    >
      <div className="space-y-8">

        <div>
          <h3 className="text-xl font-semibold text-white mb-4">
            📦 Inspection
          </h3>

          <div className="grid gap-4 md:grid-cols-3">

            <SelectionCard
              title="No Inspection"
              description="Package remains sealed and is shipped without opening."
              price={0}
              selected={inspection === "none"}
              onClick={() => {
                onInspectionChange("none");

                if (shipping === "approval") {
                  onShippingChange("auto");
                }
              }}
            />

            <SelectionCard
              title="Standard Inspection"
              description="Verify the correct item and check for visible damage."
              price={0}
              selected={inspection === "standard"}
              onClick={() => {
                onInspectionChange("standard");

                if (shipping === "auto") {
                  onShippingChange("approval");
                }
              }}
            />

            <SelectionCard
              title="Detailed Inspection"
              description="Multiple photos, accessories checked and condition report."
              price={5}
              selected={inspection === "detailed"}
              onClick={() => {
                onInspectionChange("detailed");

                if (shipping === "auto") {
                  onShippingChange("approval");
                }
              }}
            />

          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold text-white mb-4">
            🚚 Shipping Preference
          </h3>

          <div className="grid gap-4 md:grid-cols-3">

            <SelectionCard
              title="Auto Ship"
              description="Ship immediately after warehouse processing."
              price={0}
              selected={shipping === "auto"}
              disabled={inspection !== "none"}
              onClick={() => onShippingChange("auto")}
            />

            <SelectionCard
              title="Wait For Approval"
              description="Inspection photos will be uploaded before shipping."
              price={0}
              selected={shipping === "approval"}
              disabled={inspection === "none"}
              onClick={() => onShippingChange("approval")}
            />

            <SelectionCard
              title="Hold Package"
              description="Store your package securely until you ask us to ship it."
              price={5}
              selected={shipping === "hold"}
              onClick={() => onShippingChange("hold")}
            />

          </div>
        </div>

        <InfoNotice variant="info">
          <p className="font-medium">
            Shipping Rules
          </p>

          <ul className="mt-3 space-y-2 text-sm">
            <li>
              • Wait For Approval requires Standard or Detailed Inspection.
            </li>

            <li>
              • Auto Ship is only available when No Inspection is selected.
            </li>

            <li>
              • Hold Package securely stores your shipment until you give us the green light to ship internationally.
            </li>

            <li>
              • If you choose Wait For Approval and do not respond within 48 hours after receiving inspection photos, an extended storage fee of $3/day will apply.
            </li>
          </ul>
        </InfoNotice>

      </div>
    </SectionCard>
  );
}