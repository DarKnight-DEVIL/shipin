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
    <div className="app-panel p-4">
      <div className="flex items-center gap-2">
        {icon && (
          <span className="text-[var(--muted)]">{icon}</span>
        )}
        <p className="app-kicker">{title}</p>
      </div>

      <div className="mt-2 text-[15px] font-semibold text-[var(--foreground)]">
        {value}
      </div>

      {description && (
        <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
          {description}
        </p>
      )}
    </div>
  );
}
