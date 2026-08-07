"use client";

import type { Request } from "@/types/request";

import Section from "@/components/ui/Section";
import InfoCard from "@/components/ui/InfoCard";
import StatusBadge from "@/components/ui/StatusBadge";
import NextActionCard from "@/components/admin/request/NextActionCard";
import Stepper from "@/components/ui/Stepper"; // Adjust import path based on your file structure

interface Props {
  request: Request;
}

export default function OverviewPanel({ request }: Props) {
  return (
    <div className="space-y-8">
      <Section title="Overview" subtitle="Request summary">
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
              typeof request.quote?.breakdown?.grandTotal === "number"
                ? `$${request.quote.breakdown?.grandTotal.toFixed(2)}`
                : "Pending"
            }
          />

          <InfoCard
            title="Shipment"
            value={request.tracking?.carrier ?? "Not Created"}
          />

          <InfoCard
            title="Payment"
            value={
              request.status === "paid" ||
              request.status === "purchased" ||
              request.status === "warehouse_received" ||
              request.status === "packed" ||
              request.status === "shipped" ||
              request.status === "out_for_delivery" ||
              request.status === "delivered"
                ? "Completed"
                : "Pending"
            }
          />
        </div>

        {/* Customer Selected Services */}
        <Section
          title="Customer Preferences"
          subtitle="Selections made during request creation"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InfoCard
              title="Inspection"
              value={
                request.serviceSelections?.inspection === "none"
                  ? "No Inspection"
                  : request.serviceSelections?.inspection === "standard"
                  ? "Standard Inspection"
                  : "Detailed Inspection"
              }
            />

            <InfoCard
              title="Shipping Preference"
              value={
                request.serviceSelections?.shippingPreference === "auto"
                  ? "Auto Ship"
                  : request.serviceSelections?.shippingPreference ===
                    "approval"
                  ? "Wait For Approval"
                  : "Hold Package"
              }
            />
          </div>
        </Section>

        {request.quoteRegenerationRequested && (
          <div className="mb-8 rounded-2xl border border-amber-300 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-xl font-semibold text-amber-700 dark:text-amber-300">
                  🔄 New Quote Requested
                </h2>

                <p className="mt-2 text-slate-600 dark:text-slate-300">
                  The customer requested a refreshed quotation because the
                  previous quote expired.
                </p>
              </div>

              <button className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 transition">
                Generate New Quote
              </button>
            </div>
          </div>
        )}

        <div className="mt-8">
          <NextActionCard requestId={request.id} status={request.status} />
        </div>
      </Section>

      <Section title="Workflow">
        <Stepper currentStatus={request.status} />
      </Section>
    </div>
  );
}