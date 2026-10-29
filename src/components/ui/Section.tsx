interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function Section({ title, subtitle, children }: Props) {
  return (
    <section className="app-panel p-5">
      <div className="mb-4">
        <h2 className="app-section-title">{title}</h2>

        {subtitle && (
          <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">
            {subtitle}
          </p>
        )}
      </div>

      {children}
    </section>
  );
}
