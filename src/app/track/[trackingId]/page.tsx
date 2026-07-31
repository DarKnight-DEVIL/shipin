"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

const TRACKING_STAGES = [
  {
    status: "shipped",
    label: "Shipment Dispatched",
  },

  {
    status: "out_for_delivery",
    label: "Out For Delivery",
  },

  {
    status: "delivered",
    label: "Delivered",
  },
];

interface Shipment {
  trackingId: string;

  status: string;

  estimatedDelivery:
    | string
    | null;

  createdAt:
    | string
    | null;

  statusHistory: Record<
    string,
    string | null
  >;
}

export default function TrackingResultPage() {
  const params =
    useParams();

  const router =
    useRouter();

  const trackingId =
    params.trackingId as string;

  const [
    shipment,
    setShipment,
  ] = useState<Shipment | null>(
    null
  );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function loadTracking() {
      try {
        setLoading(true);

        const response =
          await fetch(
            `/api/tracking/${encodeURIComponent(
              trackingId
            )}`
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              "Shipment not found."
          );
        }

        setShipment(
          data.shipment
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Unable to track shipment."
        );
      } finally {
        setLoading(false);
      }
    }

    if (trackingId) {
      loadTracking();
    }
  }, [trackingId]);

  if (loading) {
    return (
      <div className="p-10 text-center text-white">
        Loading shipment...
      </div>
    );
  }

  if (
    error ||
    !shipment
  ) {
    return (
      <div className="max-w-xl mx-auto p-8">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h1 className="text-xl font-semibold text-red-400">
            Shipment Not Found
          </h1>

          <p className="mt-2 text-slate-400">
            {error}
          </p>

          <button
            onClick={() =>
              router.push(
                "/track"
              )
            }
            className="mt-5 rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white"
          >
            Try Another Tracking ID
          </button>
        </div>
      </div>
    );
  }

  const currentIndex =
    TRACKING_STAGES.findIndex(
      (stage) =>
        stage.status ===
        shipment.status
    );

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold text-white">
        Track Shipment
      </h1>

      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <p className="text-sm text-slate-400">
          ShipIN Tracking ID
        </p>

        <p className="mt-2 font-mono text-xl font-semibold text-purple-400">
          {shipment.trackingId}
        </p>

        {shipment.estimatedDelivery && (
          <div className="mt-5">
            <p className="text-sm text-slate-400">
              Estimated Delivery
            </p>

            <p className="mt-1 text-white">
              {
                shipment.estimatedDelivery
              }
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold text-white mb-6">
          Shipment Progress
        </h2>

        <div className="space-y-6">
          {TRACKING_STAGES.map(
            (stage, index) => {
              const completed =
                currentIndex >=
                index;

              const active =
                currentIndex ===
                index;

              const date =
                shipment
                  .statusHistory[
                  stage.status
                ];

              return (
                <div
                  key={
                    stage.status
                  }
                  className="flex gap-4"
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold ${
                      completed
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-800 text-slate-500"
                    }`}
                  >
                    {completed
                      ? "✓"
                      : index +
                        1}
                  </div>

                  <div>
                    <p
                      className={`font-medium ${
                        active
                          ? "text-emerald-400"
                          : completed
                          ? "text-white"
                          : "text-slate-500"
                      }`}
                    >
                      {
                        stage.label
                      }
                    </p>

                    {date && (
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(
                          date
                        ).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>
      </div>

      <button
        onClick={() =>
          router.push("/track")
        }
        className="mt-6 text-purple-400 hover:text-purple-300"
      >
        ← Track another shipment
      </button>
    </div>
  );
}