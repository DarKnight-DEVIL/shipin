"use client";

import PhoneInput from "react-phone-number-input";

import "react-phone-number-input/style.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function InternationalPhoneInput({
  value,
  onChange,
}: Props) {
  return (
    <PhoneInput
      defaultCountry="IN"
      international
      value={value}
      onChange={(value) =>
        onChange(value ?? "")
      }
      className="shipin-phone-input w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 transition focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
    />
  );
}