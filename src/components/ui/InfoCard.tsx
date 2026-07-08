import { ReactNode } from "react";

interface Props {
  title: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
}

export default function InfoCard({
  title,
  value,
  description,
  icon,
}: Props) {
  return (
    <div className="border border-slate-800 rounded-xl p-5 bg-slate-950">
      {icon && (
        <div className="mb-3 text-purple-400">
          {icon}
        </div>
      )}

      <p className="text-sm text-slate-400">
        {title}
      </p>

      <div className="mt-2 text-xl font-semibold text-white">
        {value}
      </div>

      {description && (
        <p className="mt-2 text-sm text-slate-500">
          {description}
        </p>
      )}
    </div>
  );
}