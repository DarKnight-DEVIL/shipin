export default function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="app-panel app-panel-flush scroll-mt-6">
      <div className="border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">{description}</p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
