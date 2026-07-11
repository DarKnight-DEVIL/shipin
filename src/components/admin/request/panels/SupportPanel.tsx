"use client";

import type { Request } from "@/types/request";

interface Props {
  request: Request;
}

export default function SupportPanel({ request }: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold text-white">
        Support
      </h2>

      <p className="mt-2 text-slate-400">
        Support panel for request #{request.id.slice(0, 6)}
      </p>
    </div>
  );
}