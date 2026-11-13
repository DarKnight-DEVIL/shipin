"use client";

interface Props {
  title: string;
  value: string | number;
  color?: string;
}

export default function KPICard({
  title,
  value,
  color = "text-white",
}: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <p className="text-slate-400">
        {title}
      </p>

      <h2
        className={`text-4xl font-bold mt-3 ${color}`}
      >
        {value}
      </h2>

    </div>
  );
}