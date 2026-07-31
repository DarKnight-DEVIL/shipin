"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TrackPage() {
  const router = useRouter();

  const [trackingId, setTrackingId] =
    useState("");

  function handleTrack(
    e: React.FormEvent
  ) {
    e.preventDefault();

    const id =
      trackingId.trim();

    if (!id) {
      return;
    }

    router.push(
      `/track/${encodeURIComponent(id)}`
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">
            Track Your Shipment
          </h1>

          <p className="mt-3 text-slate-400">
            Enter your ShipIN Tracking ID
            to view the latest shipment
            status.
          </p>
        </div>

        <form
          onSubmit={handleTrack}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
        >
          <label className="block text-sm font-medium text-slate-300 mb-2">
            ShipIN Tracking ID
          </label>

          <input
            value={trackingId}
            onChange={(e) =>
              setTrackingId(
                e.target.value
              )
            }
            placeholder="SHIPIN-XXXXXXXX"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-4 font-mono text-white outline-none focus:border-purple-500"
          />

          <button
            type="submit"
            className="mt-4 w-full rounded-xl bg-purple-600 px-5 py-4 font-semibold text-white transition hover:bg-purple-700"
          >
            Track Shipment
          </button>
        </form>
      </div>
    </div>
  );
}