"use client";

import { useState } from "react";
import type { Address } from "@/types/address";
import CountrySelect from "./CountrySelect";
import InternationalPhoneInput from "./PhoneInput";

interface Props {
  initialData?: Partial<Address>;
  onSubmit: (
    data: Omit<Address, "id" | "createdAt" | "updatedAt">
  ) => Promise<void>;
  submitting?: boolean;
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-white/10";

const labelClass =
  "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";

export default function AddressForm({
  initialData,
  onSubmit,
  submitting = false,
}: Props) {
  const [form, setForm] = useState({
    label: initialData?.label ?? "",
    recipientName: initialData?.recipientName ?? "",
    phone: initialData?.phone ?? "",
    email: initialData?.email ?? "",
    country: initialData?.country ?? "",
    state: initialData?.state ?? "",
    city: initialData?.city ?? "",
    postalCode: initialData?.postalCode ?? "",
    addressLine1: initialData?.addressLine1 ?? "",
    addressLine2: initialData?.addressLine2 ?? "",
    isDefault: initialData?.isDefault ?? false,
  });

  const update = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (submitting) return;
        await onSubmit(form);
      }}
      className="space-y-4"
    >
      {/* Label + recipient */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Label</label>
          <input
            value={form.label}
            onChange={(e) => update("label", e.target.value)}
            placeholder="Home, Office…"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Recipient</label>
          <input
            value={form.recipientName}
            onChange={(e) => update("recipientName", e.target.value)}
            placeholder="Full name"
            className={inputClass}
            required
          />
        </div>
      </div>

      {/* Contact */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Phone</label>
          <InternationalPhoneInput
            value={form.phone}
            onChange={(value) => update("phone", value)}
          />
        </div>
        <div>
          <label className={labelClass}>
            Email <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="name@email.com"
            className={inputClass}
          />
        </div>
      </div>

      {/* Location */}
      <div>
        <label className={labelClass}>Country</label>
        <CountrySelect
          value={form.country}
          onChange={(value) => update("country", value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>State / region</label>
          <input
            value={form.state}
            onChange={(e) => update("state", e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>City</label>
          <input
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Postal code</label>
          <input
            value={form.postalCode}
            onChange={(e) => update("postalCode", e.target.value)}
            className={inputClass}
            required
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Street address</label>
        <input
          value={form.addressLine1}
          onChange={(e) => update("addressLine1", e.target.value)}
          placeholder="House / flat, street"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label className={labelClass}>
          Address line 2{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          value={form.addressLine2}
          onChange={(e) => update("addressLine2", e.target.value)}
          placeholder="Landmark, building, floor…"
          className={inputClass}
        />
      </div>

      <label className="flex cursor-pointer select-none items-center gap-2.5 pt-1 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => update("isDefault", e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 accent-slate-900 dark:accent-white"
        />
        Use as default for new requests
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        {submitting ? "Saving…" : "Save address"}
      </button>
    </form>
  );
}