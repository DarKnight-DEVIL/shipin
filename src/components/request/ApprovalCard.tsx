"use client";

import { useState } from "react";
import { toast } from "sonner";
import Section from "@/components/ui/Section";
import ActionButton from "@/components/ui/ActionButton";
import { approveInternationalShipment } from "@/lib/firestore";

interface Props {
  request: {
    id: string;
    status: string;
    serviceSelections?: {
      shippingPreference?: string;
    };
    // storage is intentionally not used for fee warnings
  };
}

export default function ApprovalCard({ request }: Props) {
  const [isApproving, setIsApproving] = useState(false);

  if (request.serviceSelections?.shippingPreference !== "approval") {
    return null;
  }

  if (request.status !== "warehouse_received") {
    return null;
  }

  const handleApprove = async () => {
    if (isApproving) return;

    setIsApproving(true);
    try {
      await approveInternationalShipment(request.id);
      toast.success("Shipment approved successfully.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to approve shipment. Please try again.");
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <Section
      title="Shipment Approval"
      subtitle="Your package is ready for shipment."
    >
      <div className="space-y-5">
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 text-yellow-300">
          Your package has been inspected. Please review the inspection photos
          before approving shipment.
        </div>

        {/* Inspection photos can be rendered here when available */}

        <div className="flex gap-4">
          <ActionButton
            className="flex-1"
            disabled={isApproving}
            onClick={handleApprove}
          >
            {isApproving ? "Approving…" : "Approve Shipment"}
          </ActionButton>

          <ActionButton className="flex-1">
            Contact Support
          </ActionButton>
        </div>
      </div>
    </Section>
  );
}