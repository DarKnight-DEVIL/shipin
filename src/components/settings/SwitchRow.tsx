export default function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="app-row w-full text-left transition-colors hover:bg-[var(--surface-2)]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-[var(--foreground)]">
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-[11px] leading-4 text-[var(--muted)]">
            {description}
          </span>
        )}
      </span>

      <span
        aria-hidden
        className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${
          checked
            ? "bg-[var(--accent-solid)]"
            : "bg-[var(--surface-3)] ring-1 ring-inset ring-[var(--border)]"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-[16px]" : "translate-x-[2px]"
          }`}
        />
      </span>
    </button>
  );
}
