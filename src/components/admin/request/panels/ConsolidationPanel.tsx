"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createShipment,
  addRequestToShipment,
  getUserShipments,
} from "@/lib/shipment";

interface Props {
  request: any;
}

export default function ConsolidationPanel({ request }: Props) {
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [shipments, setShipments] = useState<any[]>([]);
  const [selectedShipment, setSelectedShipment] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await getUserShipments(request.userId);
        setShipments(data);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load user shipments.");
      }
    }

    load();
  }, [request.userId]);

  const shipmentId = request.consolidation?.shipmentId;

  async function handleCreateShipment() {
    try {
      setLoading(true);

      const id = await createShipment(request.userId);

      await addRequestToShipment(id, request.id);

      toast.success(`Shipment ${id} created successfully.`);

      window.location.reload();
    } catch (e) {
      console.error(e);

      toast.error("Unable to create shipment.", {
        description:
          e instanceof Error ? e.message : "An unexpected error occurred.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToShipment() {
    if (!selectedShipment) {
      toast.warning("Please select a shipment.");
      return;
    }

    try {
      setAssigning(true);

      await addRequestToShipment(selectedShipment, request.id);

      toast.success("Package added to shipment successfully.");

      window.location.reload();
    } catch (e) {
      console.error(e);

      toast.error("Unable to add package to shipment.", {
        description:
          e instanceof Error ? e.message : "An unexpected error occurred.",
      });
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
      <h2 className="mb-8 text-3xl font-bold text-white">
        Package Consolidation
      </h2>

      {!shipmentId ? (
        <>
          <p className="mb-8 text-slate-400">
            This package is not assigned to a shipment.
          </p>

          <button
            disabled={loading}
            onClick={handleCreateShipment}
            className="rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Shipment"}
          </button>
        </>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-slate-400">Shipment ID</p>

            <p className="mt-2 font-mono text-white">{shipmentId}</p>
          </div>

          <div className="space-y-4">
            <select
              value={selectedShipment}
              onChange={(e) => setSelectedShipment(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white outline-none focus:border-purple-500"
            >
              <option value="">Select Shipment</option>

              {shipments.map((shipment) => (
                <option key={shipment.id} value={shipment.id}>
                  {shipment.id}
                </option>
              ))}
            </select>

            <button
              disabled={assigning}
              onClick={handleAddToShipment}
              className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {assigning ? "Adding..." : "Add To Shipment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}