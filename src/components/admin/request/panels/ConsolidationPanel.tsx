"use client";

import { useEffect, useState } from "react";
import {
  createShipment,
  addRequestToShipment,
  getUserShipments,
} from "@/lib/shipment";

interface Props {
  request: any;
}

export default function ConsolidationPanel({
  request,
}: Props) {

  const [loading, setLoading] =
    useState(false);
  const [shipments, setShipments] =
    useState<any[]>([]);
  const [selectedShipment, setSelectedShipment] =
    useState("");

  useEffect(() => {
    async function load() {
      const data =
        await getUserShipments(
          request.userId
        );

      setShipments(data);
    }

    load();
  }, [request.userId]);

  const shipmentId =
    request.consolidation?.shipmentId;

  async function handleCreateShipment() {

    try {

      setLoading(true);

      const id =
        await createShipment(
          request.userId
        );

      await addRequestToShipment(
        id,
        request.id
      );

      alert(
        `Shipment ${id} created successfully.`
      );

      window.location.reload();

    } catch (e) {

      console.error(e);

      alert(
        "Unable to create shipment."
      );

    } finally {

      setLoading(false);

    }

  }

  return (

    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">

      <h2 className="text-3xl font-bold text-white mb-8">
        Package Consolidation
      </h2>

      {!shipmentId ? (

        <>
          <p className="text-slate-400 mb-8">
            This package is not assigned to a shipment.
          </p>

          <button
            disabled={loading}
            onClick={handleCreateShipment}
            className="bg-purple-600 hover:bg-purple-700 rounded-xl px-6 py-3 font-semibold"
          >
            {loading
              ? "Creating..."
              : "Create Shipment"}
          </button>

        </>

      ) : (

        <div className="space-y-6">

          <div>

            <p className="text-slate-400">
              Shipment ID
            </p>

            <p className="text-white font-mono mt-2">
              {shipmentId}
            </p>

          </div>

          <div className="space-y-4">

            <select
              value={selectedShipment}
              onChange={(e)=>
                setSelectedShipment(e.target.value)
              }
              className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3"
            >

              <option value="">
                Select Shipment
              </option>

              {shipments.map((shipment)=>(
                <option
                  key={shipment.id}
                  value={shipment.id}
                >
                  {shipment.id}
                </option>
              ))}

            </select>

            <button
              onClick={async()=>{

                if(!selectedShipment){
                  alert("Select a shipment.");
                  return;
                }

                await addRequestToShipment(
                  selectedShipment,
                  request.id
                );

                window.location.reload();

              }}
              className="bg-green-600 hover:bg-green-700 rounded-xl px-6 py-3 font-semibold"
            >
              Add To Shipment
            </button>
          </div>

        </div>

      )}

    </div>

  );

}