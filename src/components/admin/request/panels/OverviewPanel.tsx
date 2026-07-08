"use client";

import { Request } from "@/types/request";

import Section from "@/components/ui/Section";
import InfoCard from "@/components/ui/InfoCard";
import StatusBadge from "@/components/ui/StatusBadge";
import NextActionCard from "@/components/admin/request/NextActionCard";
import Stepper from "@/components/ui/Stepper"; // Adjust import path based on your file structure

interface Props {
  request: Request;
}

export default function OverviewPanel({
  request,
}: Props) {
  return (
    <div className="space-y-8">
      <Section
        title="Overview"
        subtitle="Request summary"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

          <InfoCard
            title="Customer"
            value={request.email}
            description={request.userId}
          />

          <InfoCard
            title="Status"
            value={<StatusBadge status={request.status} />}
          />

          <InfoCard
            title="Products"
            value={`${request.items?.length ?? 0} Items`}
          />

          <InfoCard
            title="Quote"
            value={
              request.quote
                ? `$${request.quote.grandTotal.toFixed(2)}`
                : "Pending"
            }
          />

          <InfoCard
            title="Shipment"
            value={
              request.tracking?.carrier ??
              "Not Created"
            }
          />

          <InfoCard
            title="Payment"
            value={
              request.status === "paid" ||
              request.status === "purchased" ||
              request.status ===
                "warehouse_received" ||
              request.status === "packed" ||
              request.status === "shipped" ||
              request.status === "out_for_delivery" ||
              request.status === "delivered"
                ? "Completed"
                : "Pending"
            }
          />

        </div>

        <div className="mt-8">
          <NextActionCard
            status={request.status}
          />
        </div>
      </Section>

      <Section title="Workflow">
        <Stepper
          currentStatus={
            request.status
          }
        />
      </Section>
    </div>
  );
}