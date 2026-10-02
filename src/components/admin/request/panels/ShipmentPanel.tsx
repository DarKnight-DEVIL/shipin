"use client";

import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Truck } from "lucide-react";

import type { Request } from "@/types/request";
import { CARRIERS } from "@/types/carrier";
import type { Carrier } from "@/types/carrier";
import type { RequestStatus } from "@/lib/requestStatus";

import Section from "@/components/ui/Section";
import ActionButton from "@/components/ui/ActionButton";

import { generateTrackingId } from "@/lib/tracking";
import { generateShippingLabel } from "@/lib/pdf/shippingLabel";

import { saveShipmentDetails } from "@/lib/firestore";

interface Props {
  request: Request;
}

/*
 * Defines the controlled workflow.
 *
 * Warehouse processing controls:
 * warehouse_received
 * -> ready_for_international_shipping
 *
 * Shipment panel controls the other shipment stages.
 */
const nextStatusMap: Partial<
  Record<
    RequestStatus,
    {
      status: RequestStatus;
      label: string;
    }
  >
> = {
  paid: {
    status: "purchased",
    label: "Mark as Purchased",
  },

  purchased: {
    status: "warehouse_received",
    label: "Mark as Warehouse Received",
  },

  ready_for_international_shipping: {
    status: "packed",
    label: "Mark as Packed",
  },

  shipped: {
    status: "out_for_delivery",
    label: "Mark as Out For Delivery",
  },

  out_for_delivery: {
    status: "delivered",
    label: "Mark as Delivered",
  },
};

const statusLabels: Partial<Record<RequestStatus, string>> = {
  submitted: "Submitted",
  review: "Under Review",
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  purchased: "Purchased",
  warehouse_received: "Warehouse Received",
  ready_for_international_shipping: "Ready For International Shipping",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out For Delivery",
  delivered: "Delivered",
  refunded: "Refunded",
};

export default function ShipmentPanel({ request }: Props) {
  const tracking = request.tracking;

  /*
   * Real carrier information.
   * ADMIN ONLY.
   *
   * This data must not be displayed
   * on the customer request page.
   */
  const [carrier, setCarrier] = useState<Carrier>(
    tracking?.carrier ?? "India Post"
  );

  const [trackingNumber, setTrackingNumber] = useState(
    tracking?.trackingNumber ?? ""
  );

  const [estimatedDelivery, setEstimatedDelivery] = useState(
    tracking?.estimatedDelivery ?? ""
  );

  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  /*
   * Server helper to update shipment status via API route.
   */
  async function updateShipmentStatusServer(status: RequestStatus) {
    const response = await fetch(
      `/api/requests/${request.id}/shipment-status`,
      {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          status,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to update shipment status.");
    }
  }

  /*
   * Determine the next allowed
   * workflow action.
   */
  const nextAction = nextStatusMap[request.status];

  /*
   * Move request to the next
   * controlled workflow stage.
   */
  async function handleNextStatus() {
    if (!nextAction) {
      return;
    }

    setUpdatingStatus(true);

    try {
      await updateShipmentStatusServer(nextAction.status);

      toast.success(
        `Request updated to: ${
          statusLabels[nextAction.status] ?? nextAction.status
        }`
      );
    } catch (error) {
      console.error("Failed to update request status:", error);

      toast.error("Failed to update request status.", {
        description:
          error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUpdatingStatus(false);
    }
  }

  /*
   * Save shipment.
   *
   * The carrier tracking number stays
   * private and is used internally.
   *
   * Customers only receive the
   * ShipIN internal tracking ID.
   */
  async function saveShipment() {
    /*
     * Shipment can only be created
     * after the package is packed.
     */
    if (
      request.status !== "packed" &&
      request.status !== "shipped"
    ) {
      toast.warning(
        "The package must be marked as Packed before creating the shipment."
      );
      return;
    }

    if (!carrier) {
      toast.warning("Please select a carrier.");
      return;
    }

    if (!trackingNumber.trim()) {
      toast.warning("Please enter the carrier tracking number.");
      return;
    }

    setSaving(true);

    try {
      /*
       * Keep existing ShipIN tracking ID.
       *
       * Never generate another ID when
       * editing shipment details.
       */
      let internalTrackingId = request.tracking?.internalTrackingId;

      if (!internalTrackingId) {
        internalTrackingId = await generateTrackingId();
      }

      /*
       * Preserve original shipment
       * creation timestamp.
       */
      const createdAt =
        request.tracking?.createdAt ?? Timestamp.now();

      await saveShipmentDetails(request.id, {
        internalTrackingId,

        carrier,

        /*
         * Private carrier tracking
         * number.
         */
        trackingNumber: trackingNumber.trim(),

        estimatedDelivery,

        /*
         * We no longer use temporary
         * carrier tracking URLs.
         */
        trackingUrl: "",

        createdAt,
      });

      /*
       * Only move to shipped after
       * valid shipment information
       * has been saved.
       */
      if (request.status === "packed") {
        await updateShipmentStatusServer("shipped");
      }

      toast.success("Shipment saved successfully.", {
        description: `ShipIN Tracking ID: ${internalTrackingId}`,
      });
    } catch (error) {
      console.error("Error saving shipment:", error);

      toast.error("Failed to save shipment.", {
        description:
          error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* =====================================
          WORKFLOW STATUS
      ===================================== */}

      <Section
        title="Shipment Workflow"
        subtitle="Manage the request through each shipment stage"
      >
        <div className="space-y-5">
          {/* Current Status */}

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Current Status</p>

            <p className="mt-2 text-xl font-semibold text-white">
              {statusLabels[request.status] ?? request.status}
            </p>
          </div>

          {/* Next Workflow Action */}

          {nextAction && (
            <ActionButton
              loading={updatingStatus}
              onClick={handleNextStatus}
              className="w-full"
            >
              {nextAction.label}
            </ActionButton>
          )}

          {/* Warehouse Processing */}

          {request.status === "warehouse_received" && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="font-medium text-amber-300">
                Warehouse processing required
              </p>

              <p className="mt-2 text-sm text-slate-400">
                Complete the warehouse inspection and mark the package as
                ready for shipment from the Warehouse tab.
              </p>
            </div>
          )}

          {/* Packed */}

          {request.status === "packed" && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
              <p className="font-medium text-blue-300">Package is packed</p>

              <p className="mt-2 text-sm text-slate-400">
                Enter the carrier information below and save the shipment.
              </p>
            </div>
          )}

          {/* Delivered */}

          {request.status === "delivered" && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="font-medium text-emerald-300">
                Shipment delivered
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* =====================================
          SHIPMENT DETAILS
      ===================================== */}

      <Section
        title="Shipment Details"
        subtitle="Private carrier information for ShipIN administrators"
      >
        <div className="space-y-5">
          {/* Carrier */}

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Carrier
            </label>

            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value as Carrier)}
              className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-white focus:outline-none focus:border-blue-500"
            >
              {CARRIERS.map((carrierName) => (
                <option key={carrierName} value={carrierName}>
                  {carrierName}
                </option>
              ))}
            </select>
          </div>

          {/* Real Carrier Tracking Number */}

          <Field
            label="Carrier Tracking Number (Private)"
            value={trackingNumber}
            onChange={setTrackingNumber}
          />

          <p className="text-xs text-slate-500">
            This tracking number is for internal ShipIN use only. Customers will
            not see the carrier tracking number.
          </p>

          {/* Estimated Delivery */}

          <Field
            label="Estimated Delivery"
            value={estimatedDelivery}
            onChange={setEstimatedDelivery}
          />

          {/* Save Shipment */}

          <ActionButton
            className="w-full"
            loading={saving}
            onClick={saveShipment}
          >
            {request.tracking?.internalTrackingId
              ? "Update Shipment"
              : "Create Shipment"}
          </ActionButton>
        </div>
      </Section>

      {/* =====================================
          SHIPIN TRACKING
      ===================================== */}

      <Section
        title="ShipIN Tracking"
        subtitle="Customer-facing tracking identity"
      >
        {request.tracking?.internalTrackingId ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
              <p className="text-sm text-slate-400">ShipIN Tracking ID</p>

              <p className="mt-2 font-mono text-xl font-semibold text-blue-400">
                {request.tracking.internalTrackingId}
              </p>

              <p className="mt-3 text-xs text-slate-500">
                This is the tracking ID shown to the customer.
              </p>
            </div>

            {/* Admin-only information */}

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
              <h3 className="font-semibold text-white mb-4">
                Internal Carrier Information
              </h3>

              <InfoRow
                label="Carrier"
                value={request.tracking.carrier}
              />

              <InfoRow
                label="Carrier Tracking Number"
                value={request.tracking.trackingNumber}
              />

              <InfoRow
                label="Estimated Delivery"
                value={request.tracking.estimatedDelivery}
              />
            </div>

            {/* Shipping Label */}

            <button
              type="button"
              onClick={() => {
                const generated = generateShippingLabel(request);

                if (!generated) {
                  toast.error(
                    "This request does not have a shipping address. Please add or select a shipping address before generating the shipping label."
                  );
                }
              }}
              className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 transition active:scale-[0.98]"
            >
              Print Shipping Label
            </button>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800">
                <Truck size={22} className="text-slate-400" />
              </div>

              <div>
                <h3 className="font-semibold text-white">
                  Tracking ID not generated yet
                </h3>

                <p className="mt-1 text-sm leading-6 text-slate-400">
                  A ShipIN tracking ID will appear here once the shipment has
                  been created and tracking information is available.
                </p>
              </div>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/* =========================================
   REUSABLE FIELD
========================================= */

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-2">{label}</label>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-white focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

/* =========================================
   ADMIN INFORMATION ROW
========================================= */

function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-800 py-3 last:border-b-0">
      <span className="text-slate-400">{label}</span>

      <span className="text-right font-medium text-white">
        {value || "-"}
      </span>
    </div>
  );
}