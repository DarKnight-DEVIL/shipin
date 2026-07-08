interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  actions,
}: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">

      <div>

        <h1 className="text-4xl font-bold text-white">
          {title}
        </h1>

        {subtitle && (
          <p className="text-slate-400 mt-2">
            {subtitle}
          </p>
        )}

      </div>

      {actions && (
        <div>
          {actions}
        </div>
      )}

    </div>
  );
}