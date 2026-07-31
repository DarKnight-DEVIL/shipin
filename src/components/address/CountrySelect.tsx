"use client";

import { useEffect, useMemo, useState } from "react";
import Select, { StylesConfig } from "react-select";
import { Country } from "country-state-city";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

interface CountryOption {
  value: string;
  label: string;
}

export default function CountrySelect({
  value,
  onChange,
}: Props) {
  const [isDark, setIsDark] =
    useState(false);

  const countries =
    useMemo<CountryOption[]>(
      () =>
        Country.getAllCountries().map(
          (country) => ({
            value: country.isoCode,
            label: `${country.flag} ${country.name}`,
          })
        ),
      []
    );

  useEffect(() => {
    const root =
      document.documentElement;

    const updateTheme = () => {
      setIsDark(
        root.classList.contains("dark")
      );
    };

    updateTheme();

    const observer =
      new MutationObserver(
        updateTheme
      );

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () =>
      observer.disconnect();
  }, []);

  const styles: StylesConfig<
    CountryOption,
    false
  > = {
    control: (
      provided,
      state
    ) => ({
      ...provided,

      minHeight: "50px",
      borderRadius: "0.75rem",

      backgroundColor: isDark
        ? "#020617"
        : "#ffffff",

      borderColor: state.isFocused
        ? "#a855f7"
        : isDark
        ? "#334155"
        : "#cbd5e1",

      boxShadow: state.isFocused
        ? "0 0 0 2px rgba(168, 85, 247, 0.2)"
        : "none",

      "&:hover": {
        borderColor: "#a855f7",
      },
    }),

    valueContainer: (
      provided
    ) => ({
      ...provided,
      padding: "0 12px",
    }),

    singleValue: (
      provided
    ) => ({
      ...provided,
      color: isDark
        ? "#ffffff"
        : "#0f172a",
    }),

    input: (provided) => ({
      ...provided,
      color: isDark
        ? "#ffffff"
        : "#0f172a",
    }),

    placeholder: (
      provided
    ) => ({
      ...provided,
      color: isDark
        ? "#64748b"
        : "#94a3b8",
    }),

    menu: (provided) => ({
      ...provided,

      backgroundColor: isDark
        ? "#0f172a"
        : "#ffffff",

      border:
        "1px solid " +
        (isDark
          ? "#334155"
          : "#e2e8f0"),

      borderRadius: "0.75rem",
      overflow: "hidden",

      zIndex: 100,
    }),

    menuList: (provided) => ({
      ...provided,
      padding: "4px",
    }),

    option: (
      provided,
      state
    ) => ({
      ...provided,

      borderRadius: "0.5rem",
      cursor: "pointer",

      color: isDark
        ? "#ffffff"
        : "#0f172a",

      backgroundColor:
        state.isSelected
          ? "#9333ea"
          : state.isFocused
          ? isDark
            ? "#1e293b"
            : "#f1f5f9"
          : "transparent",

      "&:active": {
        backgroundColor:
          "#9333ea",
      },
    }),

    indicatorSeparator: (
      provided
    ) => ({
      ...provided,

      backgroundColor: isDark
        ? "#334155"
        : "#e2e8f0",
    }),

    dropdownIndicator: (
      provided
    ) => ({
      ...provided,

      color: isDark
        ? "#94a3b8"
        : "#64748b",

      "&:hover": {
        color: "#a855f7",
      },
    }),
  };

  return (
    <Select<CountryOption, false>
      options={countries}
      value={
        countries.find(
          (country) =>
            country.value === value
        ) ?? null
      }
      onChange={(option) =>
        onChange(
          option?.value ?? ""
        )
      }
      placeholder="Select Country"
      styles={styles}
      isSearchable
    />
  );
}