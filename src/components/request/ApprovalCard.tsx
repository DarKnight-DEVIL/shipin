"use client";

import { toast } from "sonner";
import Section from "@/components/ui/Section";
import ActionButton from "@/components/ui/ActionButton";
import { approveInternationalShipment } from "@/lib/firestore";

interface Props {
  request: any;
}

export default function ApprovalCard({
  request,
}: Props) {
  if (
    request.serviceSelections?.shippingPreference !==
    "approval"
  ) {
    return null;
  }

  if (request.status !== "warehouse_received") {
    return null;
  }

  return (
    <Section
      title="Shipment Approval"
      subtitle="Your package is ready for shipment."
    >
      <div className="space-y-5">

        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 text-yellow-300">
          Your package has been inspected.

          Please review the inspection photos before approving shipment.
        </div>

        {request.storage?.freeUntil && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">

            Approve shipment before the deadline to avoid a

            <strong> $3/day storage fee.</strong>

          </div>
        )}

        <div className="flex gap-4">

          <ActionButton
            className="flex-1"
            onClick={async () => {
              await approveInternationalShipment(
                request.id
              );

              toast.success("Shipment approved successfully.");
            }}>
            Approve Shipment
          </ActionButton>

          <ActionButton
            className="flex-1"
          >
            Contact Support
          </ActionButton>

        </div>

      </div>
    </Section>
  );
}