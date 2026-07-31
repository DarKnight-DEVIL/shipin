"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  getShipment,
  getShipmentRequests,
} from "@/lib/shipment";

export default function ShipmentPage() {
  const { id } = useParams();

  const [shipment, setShipment] =
    useState<any>(null);

  const [requests, setRequests] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    async function load() {
      if (!id) return;

      const shipmentData =
        await getShipment(id as string);

      if (shipmentData) {
        setShipment(shipmentData);

        const reqs =
          await getShipmentRequests(
            shipmentData.id
          );

        setRequests(reqs);
      }

      setLoading(false);
    }

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="p-8 text-white">
        Loading shipment...
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="p-8 text-white">
        Shipment not found.
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8">

      <h1 className="text-4xl font-bold text-white mb-8">
        Shipment
      </h1>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 mb-8">

        <div className="grid md:grid-cols-2 gap-6">

          <div>

            <p className="text-slate-400">
              Shipment ID
            </p>

            <p className="text-white font-mono">
              {shipment.id}
            </p>

          </div>

          <div>

            <p className="text-slate-400">
              Status
            </p>

            <p className="text-green-400">
              {shipment.status}
            </p>

          </div>

          <div>

            <p className="text-slate-400">
              Courier
            </p>

            <p className="text-white">
              {shipment.courier || "-"}
            </p>

          </div>

          <div>

            <p className="text-slate-400">
              Tracking
            </p>

            <p className="text-white">
              {shipment.tracking || "-"}
            </p>

          </div>

          <div>

            <p className="text-slate-400">
              Weight
            </p>

            <p className="text-white">
              {shipment.weight} kg
            </p>

          </div>

          <div>

            <p className="text-slate-400">
              Dimensions
            </p>

            <p className="text-white">
              {shipment.length} × {shipment.width} × {shipment.height} cm
            </p>

          </div>

        </div>

      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">

        <h2 className="text-2xl font-bold text-white mb-6">
          Packages
        </h2>

        <div className="space-y-4">

          {requests.map((request) => (

            <div
              key={request.id}
              className="border border-slate-800 rounded-xl p-4"
            >

              <p className="text-white font-semibold">
                Request #{request.id.slice(0,6)}
              </p>

              <p className="text-slate-400">
                {request.items.length} Items
              </p>

              <p className="text-green-400 mt-2">
                {request.status}
              </p>

            </div>

          ))}

        </div>

      </div>

    </div>
  );
}