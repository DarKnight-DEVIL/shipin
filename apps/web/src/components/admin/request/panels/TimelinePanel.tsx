"use client";

import type { Request } from "@/types/request";

interface Props {
  request: Request;
}

export default function TimelinePanel({ request }: Props) {
  // Declare the timeline array using the request configuration properties
  const events = [
    {
      title: "Request Submitted",
      description: "The initial request was successfully created by the customer.",
      completed: true,
    },
    {
      title: "Additional Services Selected",
      description: `${
        request.serviceSelections?.inspection === "detailed"
          ? "Detailed Inspection"
          : request.serviceSelections?.inspection === "standard"
          ? "Standard Inspection"
          : "No Inspection"
      } • ${
        request.serviceSelections?.shippingPreference === "auto"
          ? "Auto Ship"
          : request.serviceSelections?.shippingPreference === "approval"
          ? "Wait For Approval"
          : "Hold Package"
      }`,
      completed: true,
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold text-white">
        Timeline
      </h2>

      <p className="mt-2 text-slate-400">
        Timeline for request #{request.id.slice(0, 6)}
      </p>

      {/* Render the timeline entries view stream */}
      <div className="mt-6 space-y-6">
        {events.map((event, index) => (
          <div key={index} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`h-4 w-4 rounded-full border-2 ${event.completed ? 'bg-blue-500 border-blue-500' : 'border-slate-700 bg-slate-900'}`} />
              {index < events.length - 1 && <div className="w-0.5 grow bg-slate-800 my-1" />}
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">{event.title}</h3>
              <p className="text-xs text-slate-400 mt-1">{event.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}