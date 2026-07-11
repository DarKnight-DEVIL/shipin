"use client";

import { useState } from "react";

import type { Request } from "@/types/request";
import Section from "@/components/ui/Section";
import ActionButton from "@/components/ui/ActionButton";
// Import WarehousePanel if it's located in another file, e.g.:
// import WarehousePanel from "./WarehousePanel"; 

import {
  saveShipmentDetails,
  updateShipmentStatus,
} from "@/lib/firestore";

const shipmentStages = [
  {
    label: "Purchased",
    value: "purchased",
  },
  {
    label: "Warehouse Received",
    value: "warehouse_received",
  },
  {
    label: "Packed",
    value: "packed",
  },
  {
    label: "Shipped",
    value: "shipped",
  },
  {
    label: "Out For Delivery",
    value: "out_for_delivery",
  },
  {
    label: "Delivered",
    value: "delivered",
  },
] as const;

interface Props {
  request: Request;
}

export default function ShipmentPanel({
  request,
}: Props) {
  const tracking = request.tracking;

  const [carrier, setCarrier] = useState(
    tracking?.carrier ?? ""
  );

  const [trackingNumber, setTrackingNumber] =
    useState(
      tracking?.trackingNumber ?? ""
    );

  const [
    estimatedDelivery,
    setEstimatedDelivery,
  ] = useState(
    tracking?.estimatedDelivery ?? ""
  );

  const [trackingUrl, setTrackingUrl] =
    useState(
      tracking?.trackingUrl ?? ""
    );

  const [saving, setSaving] =
    useState(false);

  async function saveShipment() {
    setSaving(true);

    await saveShipmentDetails(
      request.id,
      {
        carrier,
        trackingNumber,
        estimatedDelivery,
        trackingUrl,
      }
    );

    await updateShipmentStatus(
      request.id,
      "shipped"
    );

    alert("Shipment saved.");

    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <Section
        title="Shipment Stages"
        subtitle="Update the current workflow stage"
      >
        <div className="space-y-3">
          {shipmentStages.map((stage) => {
            const isActive = request.status === stage.value;
            return (
              <button
                key={stage.value}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  isActive
                    ? "border-emerald-500 bg-emerald-950/30 text-emerald-400 font-medium"
                    : "border-slate-700 hover:bg-slate-800 text-white"
                }`}
                onClick={() =>
                  updateShipmentStatus(
                    request.id,
                    stage.value
                  )
                }
              >
                {stage.label} {isActive && "• Current"}
              </button>
            );
          })}
        </div>
      </Section>

      {request.status === "warehouse_received" && (
        <WarehousePanel />
      )}

      <Section
        title="Shipment"
        subtitle="Shipment details"
      >
        <div className="space-y-5">
          <Field
            label="Carrier"
            value={carrier}
            onChange={setCarrier}
          />

          <Field
            label="Tracking Number"
            value={trackingNumber}
            onChange={setTrackingNumber}
          />

          <Field
            label="Estimated Delivery"
            value={estimatedDelivery}
            onChange={setEstimatedDelivery}
          />

          <Field
            label="Tracking URL"
            value={trackingUrl}
            onChange={setTrackingUrl}
          />

          <ActionButton
            className="w-full"
            loading={saving}
            onClick={saveShipment}
          >
            Save Shipment
          </ActionButton>
        </div>
      </Section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-2">
        {label}
      </label>

      <input
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-white"
      />
    </div>
  );
}

// Placeholder for WarehousePanel if not defined elsewhere
function WarehousePanel() {
  return (
    <Section title="Warehouse Management" subtitle="Process package verification">
      <div className="p-4 rounded-xl border border-dashed border-slate-700 text-slate-400 text-sm">
        Warehouse internal panels and checklists display here.
      </div>
    </Section>
  );
}