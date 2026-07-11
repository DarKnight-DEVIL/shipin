"use client";

import { useState } from "react";

import type { Request } from "@/types/request";
import Section from "@/components/ui/Section";
import ActionButton from "@/components/ui/ActionButton";
import { startStorageTimer } from "@/lib/firestore";
import InspectionPhotos from "./InspectionPhotos";

interface Props {
  request: Request;
}

export default function WarehousePanel({
  request,
}: Props) {
  const [weight, setWeight] = useState(
    request.warehouse?.weight ?? ""
  );

  const [length, setLength] = useState(
    request.warehouse?.length ?? ""
  );

  const [width, setWidth] = useState(
    request.warehouse?.width ?? ""
  );

  const [height, setHeight] = useState(
    request.warehouse?.height ?? ""
  );

  const [condition, setCondition] =
    useState(
      request.warehouse?.condition ??
        "Good"
    );

  // Step 1: Initialize variables from user request configurations
  const inspection =
    request.serviceSelections?.inspection ?? "standard";
  const shippingPreference =
    request.serviceSelections?.shippingPreference ?? "approval";

  const handlePhotoUploadTrigger = async () => {
    if (shippingPreference === "approval") {
      await startStorageTimer(request.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step 2: Customer Instructions Section */}
      <Section
        title="Customer Instructions"
        subtitle="Selected package handling preferences"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <p className="text-sm text-slate-400 mb-2">
              Inspection
            </p>

            <p className="text-lg font-semibold text-white">
              {inspection === "none"
                ? "No Inspection"
                : inspection === "standard"
                ? "Standard Inspection"
                : "Detailed Inspection"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <p className="text-sm text-slate-400 mb-2">
              Shipping Preference
            </p>

            <p className="text-lg font-semibold text-white">
              {shippingPreference === "auto"
                ? "Auto Ship"
                : shippingPreference === "approval"
                ? "Wait For Approval"
                : "Hold Package"}
            </p>
          </div>

        </div>
      </Section>

      {/* Step 3: Warehouse Actions Section */}
      <Section
        title="Warehouse Actions"
        subtitle="Required processing"
      >
        <div className="space-y-3">

          {inspection === "none" && (
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4 text-green-300">
              ✅ Keep the package sealed. Do not open it.
            </div>
          )}

          {inspection === "standard" && (
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4 text-blue-300">
              📦 Open package, verify the correct item, and inspect for visible damage.
            </div>
          )}

          {inspection === "detailed" && (
            <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-4 text-purple-300">
              📷 Perform a detailed inspection, verify accessories, and upload multiple photos.
            </div>
          )}

          {shippingPreference === "auto" && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 text-emerald-300">
              🚚 Ship internationally immediately after warehouse processing.
            </div>
          )}

          {shippingPreference === "approval" && (
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-4 text-yellow-300">
              ⏳ Wait for customer approval after uploading inspection photos.
            </div>
          )}

          {shippingPreference === "hold" && (
            <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-4 text-orange-300">
              📦 Hold package until the customer requests international shipment.
            </div>
          )}

        </div>
      </Section>

      {/* Warehouse Checklist Section */}
      <Section
        title="Warehouse Checklist"
        subtitle="Processing progress"
      >
        <div className="space-y-4">

          <label className="flex items-center gap-3 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              className="h-5 w-5 rounded bg-slate-900 border-slate-700 text-blue-500 accent-blue-500"
            />
            <span>Package received</span>
          </label>

          {inspection !== "none" && (
            <label className="flex items-center gap-3 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                className="h-5 w-5 rounded bg-slate-900 border-slate-700 text-blue-500 accent-blue-500"
                onChange={(e) => {
                  if (e.target.checked) handlePhotoUploadTrigger();
                }}
              />
              <span>Inspection completed</span>
            </label>
          )}

          {inspection === "detailed" && (
            <label className="flex items-center gap-3 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                className="h-5 w-5 rounded bg-slate-900 border-slate-700 text-blue-500 accent-blue-500"
                onChange={(e) => {
                  if (e.target.checked) handlePhotoUploadTrigger();
                }}
              />
              <span>Photos uploaded</span>
            </label>
          )}

          <label className="flex items-center gap-3 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              className="h-5 w-5 rounded bg-slate-900 border-slate-700 text-blue-500 accent-blue-500"
            />
            <span>Package measured</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              className="h-5 w-5 rounded bg-slate-900 border-slate-700 text-blue-500 accent-blue-500"
            />
            <span>Ready for shipment</span>
          </label>

        </div>
      </Section>

      {inspection !== "none" && (
        <InspectionPhotos
          requestId={request.id}
          onUploadSuccess={handlePhotoUploadTrigger}
        />
      )}

      {/* Measurement Metrics Section Block */}
      <Section
        title="Warehouse Inspection"
        subtitle="Inspect package after arrival"
      >
        <div className="grid md:grid-cols-2 gap-5">

          <Input
            label="Weight (kg)"
            value={weight}
            onChange={setWeight}
          />

          <Input
            label="Length (cm)"
            value={length}
            onChange={setLength}
          />

          <Input
            label="Width (cm)"
            value={width}
            onChange={setWidth}
          />

          <Input
            label="Height (cm)"
            value={height}
            onChange={setHeight}
          />

        </div>

        <div className="mt-6">

          <label className="block text-sm text-slate-400 mb-2">
            Package Condition
          </label>

          <select
            value={condition}
            onChange={(e) =>
              setCondition(e.target.value)
            }
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-white"
          >
            <option>Excellent</option>
            <option>Good</option>
            <option>Damaged</option>
          </select>

        </div>

        <div className="mt-8">

          <ActionButton
            className="w-full"
          >
            Save Inspection
          </ActionButton>

        </div>

      </Section>
    </div>
  );
}

interface InputProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
}

function Input({
  label,
  value,
  onChange,
}: InputProps) {
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