"use client";

export default function LoadingCard() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 animate-pulse">
      <div className="h-8 w-48 bg-slate-800 rounded mb-6"></div>

      <div className="space-y-4">
        <div className="h-5 bg-slate-800 rounded"></div>
        <div className="h-5 bg-slate-800 rounded w-5/6"></div>
        <div className="h-5 bg-slate-800 rounded w-2/3"></div>
      </div>
    </div>
  );
}