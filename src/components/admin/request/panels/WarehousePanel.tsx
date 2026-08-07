"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { Request } from "@/types/request";

import Section from "@/components/ui/Section";
import ActionButton from "@/components/ui/ActionButton";

import InspectionPhotos from "./InspectionPhotos";
import InspectionPhotoGallery from "@/components/admin/request/InspectionPhotoGallery";

import {
  saveWarehouseInspection,
  updateWarehouseChecklist,
  startStorageTimer,
} from "@/lib/firestore";

interface Props {
  request: Request;
}

export default function WarehousePanel({ request }: Props) {
  const warehouse = request.warehouse;

  const inspection = request.serviceSelections?.inspection ?? "standard";

  const shippingPreference =
    request.serviceSelections?.shippingPreference ?? "approval";

  const [weight, setWeight] = useState(
    warehouse?.weight?.toString() ?? ""
  );

  const [length, setLength] = useState(
    warehouse?.length?.toString() ?? ""
  );

  const [width, setWidth] = useState(
    warehouse?.width?.toString() ?? ""
  );

  const [height, setHeight] = useState(
    warehouse?.height?.toString() ?? ""
  );

  const [condition, setCondition] = useState(
    warehouse?.condition ?? "Good"
  );

  const [checklist, setChecklist] = useState({
    packageReceived: warehouse?.checklist?.packageReceived ?? false,
    inspectionCompleted: warehouse?.checklist?.inspectionCompleted ?? false,
    photosUploaded: warehouse?.checklist?.photosUploaded ?? false,
    measured: warehouse?.checklist?.measured ?? false,
    readyForShipment: warehouse?.checklist?.readyForShipment ?? false,
  });

  const [saving, setSaving] = useState(false);
  const [updatingChecklist, setUpdatingChecklist] = useState(false);

  /*
   * Sync when parent request gets refreshed.
   */
  useEffect(() => {
    if (!request.warehouse) {
      return;
    }

    setChecklist({
      packageReceived:
        request.warehouse.checklist?.packageReceived ?? false,
      inspectionCompleted:
        request.warehouse.checklist?.inspectionCompleted ?? false,
      photosUploaded:
        request.warehouse.checklist?.photosUploaded ?? false,
      measured: request.warehouse.checklist?.measured ?? false,
      readyForShipment:
        request.warehouse.checklist?.readyForShipment ?? false,
    });
  }, [request.warehouse]);

  async function updateShipmentStatusServer(status: string) {
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
      throw new Error(
        data.error || "Failed to update shipment status."
      );
    }
  }

  async function handleChecklistChange(
    key:
      | "packageReceived"
      | "inspectionCompleted"
      | "photosUploaded"
      | "measured"
      | "readyForShipment",
    value: boolean
  ) {
    setUpdatingChecklist(true);

    const previousValue = checklist[key];

    /*
     * Optimistic UI update.
     */
    setChecklist((current) => ({
      ...current,
      [key]: value,
    }));

    try {
      await updateWarehouseChecklist(request.id, {
        [key]: value,
      });

      /*
       * When package is received, move request into warehouse.
       */
      if (key === "packageReceived" && value) {
        await updateShipmentStatusServer("warehouse_received");
      }

      /*
       * Start storage timer when inspection is complete and
       * customer approval is required.
       */
      if (
        key === "inspectionCompleted" &&
        value &&
        shippingPreference === "approval"
      ) {
        await startStorageTimer(request.id);
      }

      /*
       * Ready for shipment moves workflow to packed.
       */
      if (key === "readyForShipment" && value) {
        await updateShipmentStatusServer(
          "ready_for_international_shipping"
        );
      }

      toast.success("Checklist updated successfully.");
    } catch (error) {
      console.error("Checklist update failed:", error);

      /*
       * Restore checkbox if Firestore failed.
       */
      setChecklist((current) => ({
        ...current,
        [key]: previousValue,
      }));

      toast.error("Failed to update warehouse checklist.", {
        description:
          error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUpdatingChecklist(false);
    }
  }

  async function handleSaveInspection() {
    if (!weight || !length || !width || !height) {
      toast.error("Please enter all package measurements.");
      return;
    }

    setSaving(true);

    try {
      await saveWarehouseInspection(request.id, {
        weight: Number(weight),
        length: Number(length),
        width: Number(width),
        height: Number(height),
        condition: condition || "Good",
      });

      await updateWarehouseChecklist(request.id, {
        measured: true,
        inspectionCompleted:
          inspection === "none" ? true : checklist.inspectionCompleted,
      });

      setChecklist((current) => ({
        ...current,
        measured: true,
        inspectionCompleted:
          inspection === "none" ? true : current.inspectionCompleted,
      }));

      toast.success("Warehouse inspection saved successfully.");
    } catch (error) {
      console.error("Save inspection failed:", error);

      toast.error("Failed to save warehouse inspection.", {
        description:
          error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUploadSuccess() {
    try {
      await updateWarehouseChecklist(request.id, {
        photosUploaded: true,
      });

      setChecklist((current) => ({
        ...current,
        photosUploaded: true,
      }));

      toast.success("Inspection photos updated.");
    } catch (error) {
      console.error("Failed to update photo checklist:", error);

      toast.error("Failed to update photo checklist.", {
        description:
          error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <div className="space-y-6">
      <Section
        title="Customer Instructions"
        subtitle="Selected package handling preferences"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <p className="text-sm text-slate-400 mb-2">Inspection</p>

            <p className="text-lg font-semibold text-white">
              {inspection === "none"
                ? "No Inspection"
                : inspection === "standard"
                ? "Standard Inspection"
                : "Detailed Inspection"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <p className="text-sm text-slate-400 mb-2">Shipping Preference</p>

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

      <Section title="Warehouse Actions" subtitle="Required processing">
        <div className="space-y-3">
          {inspection === "none" && (
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4 text-green-300">
              Keep the package sealed. Do not open it.
            </div>
          )}

          {inspection === "standard" && (
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4 text-blue-300">
              Open package, verify the correct item, and inspect for visible
              damage.
            </div>
          )}

          {inspection === "detailed" && (
            <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-4 text-purple-300">
              Perform a detailed inspection, verify accessories, and upload
              multiple photos.
            </div>
          )}

          {shippingPreference === "auto" && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 text-emerald-300">
              Ship internationally immediately after warehouse processing.
            </div>
          )}

          {shippingPreference === "approval" && (
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-4 text-yellow-300">
              Wait for customer approval before international shipment.
            </div>
          )}

          {shippingPreference === "hold" && (
            <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-4 text-orange-300">
              Hold package until the customer requests international shipment.
            </div>
          )}
        </div>
      </Section>

      <Section title="Warehouse Checklist" subtitle="Processing progress">
        <div className="space-y-4">
          <ChecklistItem
            label="Package received"
            checked={checklist.packageReceived}
            disabled={updatingChecklist}
            onChange={(value) =>
              handleChecklistChange("packageReceived", value)
            }
          />

          {inspection !== "none" && (
            <ChecklistItem
              label="Inspection completed"
              checked={checklist.inspectionCompleted}
              disabled={updatingChecklist}
              onChange={(value) =>
                handleChecklistChange("inspectionCompleted", value)
              }
            />
          )}

          {inspection === "detailed" && (
            <ChecklistItem
              label="Photos uploaded"
              checked={checklist.photosUploaded}
              disabled={updatingChecklist}
              onChange={(value) =>
                handleChecklistChange("photosUploaded", value)
              }
            />
          )}

          <ChecklistItem
            label="Package measured"
            checked={checklist.measured}
            disabled={updatingChecklist}
            onChange={(value) => handleChecklistChange("measured", value)}
          />

          <ChecklistItem
            label="Ready for shipment"
            checked={checklist.readyForShipment}
            disabled={updatingChecklist}
            onChange={(value) =>
              handleChecklistChange("readyForShipment", value)
            }
          />
        </div>
      </Section>

      {inspection !== "none" && (
        <InspectionPhotos
          requestId={request.id}
          onUploadSuccess={handlePhotoUploadSuccess}
        />
      )}

      <Section
        title="Uploaded Inspection Photos"
        subtitle="Warehouse inspection evidence"
      >
        <InspectionPhotoGallery
          photos={
            request.warehouse?.photos ??
            request.warehouse?.inspectionPhotos ??
            []
          }
        />
      </Section>

      <Section
        title="Warehouse Inspection"
        subtitle="Inspect package after arrival"
      >
        <div className="grid md:grid-cols-2 gap-5">
          <Input label="Weight (kg)" value={weight} onChange={setWeight} />

          <Input label="Length (cm)" value={length} onChange={setLength} />

          <Input label="Width (cm)" value={width} onChange={setWidth} />

          <Input label="Height (cm)" value={height} onChange={setHeight} />
        </div>

        <div className="mt-6">
          <label className="block text-sm text-slate-400 mb-2">
            Package Condition
          </label>

          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-white"
          >
            <option>Excellent</option>
            <option>Good</option>
            <option>Damaged</option>
          </select>
        </div>

        <div className="mt-8">
          <ActionButton
            onClick={handleSaveInspection}
            loading={saving}
            className="w-full"
          >
            Save Inspection
          </ActionButton>
        </div>
      </Section>
    </div>
  );
}

function ChecklistItem({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 rounded bg-slate-900 border-slate-700 accent-blue-500"
      />

      <span>{label}</span>
    </label>
  );
}

function Input({
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
        className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-white"
      />
    </div>
  );
}