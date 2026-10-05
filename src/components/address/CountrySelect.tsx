"use client";

import { useEffect, useMemo, useState } from "react";
import Select, { StylesConfig, components } from "react-select";
import { Country } from "country-state-city";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

interface CountryOption {
  value: string;
  label: string;
  name: string;
}

export default function CountrySelect({ value, onChange }: Props) {
  const [isDark, setIsDark] = useState(false);

  const countries = useMemo<CountryOption[]>(
    () =>
      Country.getAllCountries().map((c) => ({
        value: c.isoCode,
        label: `${c.flag}  ${c.name}`,
        name: c.name,
      })),
    []
  );

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const bg = isDark ? "#0f172a" : "#ffffff";
  const bgMuted = isDark ? "#1e293b" : "#f1f5f9";
  const border = isDark ? "#334155" : "#e2e8f0";
  const text = isDark ? "#f8fafc" : "#0f172a";
  const muted = isDark ? "#64748b" : "#94a3b8";
  const accent = "#9333ea";

  const styles: StylesConfig<CountryOption, false> = {
    control: (base, state) => ({
      ...base,
      minHeight: 42,
      borderRadius: 8,
      backgroundColor: isDark ? "#020617" : "#ffffff",
      borderColor: state.isFocused ? accent : border,
      boxShadow: state.isFocused ? `0 0 0 2px ${accent}33` : "none",
      "&:hover": { borderColor: state.isFocused ? accent : isDark ? "#475569" : "#cbd5e1" },
    }),
    valueContainer: (base) => ({ ...base, padding: "0 12px" }),
    singleValue: (base) => ({ ...base, color: text }),
    input: (base) => ({ ...base, color: text, margin: 0, padding: 0 }),
    placeholder: (base) => ({ ...base, color: muted }),
    indicatorSeparator: (base) => ({ ...base, backgroundColor: border }),
    dropdownIndicator: (base) => ({
      ...base,
      color: muted,
      "&:hover": { color: accent },
    }),
    // Critical: solid menu colors so nothing goes white-on-white
    menu: (base) => ({
      ...base,
      backgroundColor: bg,
      border: `1px solid ${border}`,
      borderRadius: 10,
      overflow: "hidden",
      zIndex: 9999,
      boxShadow: "0 12px 40px -12px rgba(0,0,0,0.35)",
    }),
    menuList: (base) => ({
      ...base,
      padding: 6,
      maxHeight: 240,
      backgroundColor: bg,
    }),
    option: (base, state) => ({
      ...base,
      borderRadius: 6,
      cursor: "pointer",
      color: state.isSelected ? "#ffffff" : text,
      backgroundColor: state.isSelected
        ? accent
        : state.isFocused
          ? bgMuted
          : bg,
      ":active": {
        backgroundColor: state.isSelected ? accent : bgMuted,
      },
    }),
    noOptionsMessage: (base) => ({
      ...base,
      color: muted,
      backgroundColor: bg,
    }),
  };

  return (
    <Select<CountryOption, false>
      options={countries}
      value={countries.find((c) => c.value === value) ?? null}
      onChange={(opt) => onChange(opt?.value ?? "")}
      placeholder="Select country"
      styles={styles}
      isSearchable
      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
      menuPosition="fixed"
      menuShouldScrollIntoView={false}
      filterOption={(option, input) =>
        option.data.name.toLowerCase().includes(input.toLowerCase()) ||
        option.data.value.toLowerCase().includes(input.toLowerCase())
      }
      components={{
        IndicatorSeparator: () => null,
      }}
    />
  );
}