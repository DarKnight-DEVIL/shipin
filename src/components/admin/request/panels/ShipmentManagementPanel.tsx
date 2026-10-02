"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Props {
  shipment: any;
}

export default function ShipmentManagementPanel({
  shipment,
}: Props) {
  const [courier, setCourier] = useState(
    shipment?.courier || ""
  );

  const [tracking, setTracking] = useState(
    shipment?.tracking || ""
  );

  const [weight, setWeight] = useState(
    shipment?.weight || 0
  );

  const [length, setLength] = useState(
    shipment?.length || 0
  );

  const [width, setWidth] = useState(
    shipment?.width || 0
  );

  const [height, setHeight] = useState(
    shipment?.height || 0
  );

  const [saving, setSaving] = useState(false);

  async function saveShipment() {
    try {
      setSaving(true);

      await updateDoc(
        doc(db, "shipments", shipment.id),
        {
          courier,
          tracking,
          weight,
          length,
          width,
          height,
          updatedAt: serverTimestamp(),
        }
      );

      toast.success("Shipment updated.");
    } catch (e) {
      console.error(e);
      toast.error("Unable to update shipment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">

      <h2 className="text-3xl font-bold text-white mb-8">
        Shipment Management
      </h2>

      <div className="grid md:grid-cols-2 gap-6">

        <input
          value={courier}
          onChange={(e)=>setCourier(e.target.value)}
          placeholder="Courier"
          className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-white"
        />

        <input
          value={tracking}
          onChange={(e)=>setTracking(e.target.value)}
          placeholder="Tracking Number"
          className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-white"
        />

        <input
          type="number"
          value={weight}
          onChange={(e)=>setWeight(Number(e.target.value))}
          placeholder="Weight"
          className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-white"
        />

        <input
          type="number"
          value={length}
          onChange={(e)=>setLength(Number(e.target.value))}
          placeholder="Length"
          className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-white"
        />

        <input
          type="number"
          value={width}
          onChange={(e)=>setWidth(Number(e.target.value))}
          placeholder="Width"
          className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-white"
        />

        <input
          type="number"
          value={height}
          onChange={(e)=>setHeight(Number(e.target.value))}
          placeholder="Height"
          className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-white"
        />

      </div>

      <button
        onClick={saveShipment}
        disabled={saving}
        className="mt-8 bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-6 py-3 font-semibold transition disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Shipment"}
      </button>

    </div>
  );
}