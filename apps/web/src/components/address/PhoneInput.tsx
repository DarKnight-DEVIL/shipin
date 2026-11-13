"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PhoneInput, {
  getCountryCallingCode,
  type Country,
} from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import "react-phone-number-input/style.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/** Custom country picker — flag only (no dial code here) */
function CountrySelect({
  value,
  onChange,
  options,
  iconComponent: Icon,
  disabled,
}: {
  value?: Country;
  onChange: (value: Country | undefined) => void;
  options: { value?: Country; label: string; divider?: boolean }[];
  iconComponent: React.ComponentType<{
    country: Country;
    label: string;
    aspectRatio?: number;
  }>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => {
      if (o.divider || !o.value) return false;
      if (!q) return true;
      const code = getCountryCallingCode(o.value);
      return (
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        `+${code}`.includes(q)
      );
    });
  }, [options, query]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md px-1 py-0.5 outline-none hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label={selected?.label ?? "Select country"}
      >
        {value && Icon ? (
          <span className="flex h-4 w-6 overflow-hidden rounded-[2px]">
            <Icon country={value} label={selected?.label ?? value} />
          </span>
        ) : (
          <span className="text-xs text-slate-400">🌐</span>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`text-slate-400 transition ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[9999] mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {list.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-slate-400">
                No matches
              </li>
            )}
            {list.map((opt) => {
              const active = opt.value === value;
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                      active
                        ? "bg-purple-50 text-purple-800 dark:bg-purple-500/15 dark:text-purple-200"
                        : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    {opt.value && Icon && (
                      <span className="flex h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px]">
                        <Icon country={opt.value} label={opt.label} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">
                      +{getCountryCallingCode(opt.value!)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function InternationalPhoneInput({ value, onChange }: Props) {
  return (
    <PhoneInput
      defaultCountry="IN"
      international
      countryCallingCodeEditable={false}
      value={value || undefined}
      onChange={(v) => {
        // Always store E.164 when possible (e.g. +919876543210)
        // Empty / incomplete stays as "" so the form can still save
        onChange(v ?? "");
      }}
      flags={flags}
      countrySelectComponent={CountrySelect}
      className="shipin-phone-input w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/5 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus-within:border-slate-500 dark:focus-within:ring-white/10"
    />
  );
}