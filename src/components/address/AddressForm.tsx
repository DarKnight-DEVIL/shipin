"use client";

import { useState } from "react";
import type { Address } from "@/types/address";

import CountrySelect from "./CountrySelect";
import InternationalPhoneInput from "./PhoneInput";

interface Props {
  initialData?: Partial<Address>;
  onSubmit: (
    data: Omit<
      Address,
      "id" | "createdAt" | "updatedAt"
    >
  ) => Promise<void>;
}

const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600";

export default function AddressForm({
  initialData,
  onSubmit,
}: Props) {
  const [form, setForm] = useState({
    label: initialData?.label ?? "",
    recipientName:
      initialData?.recipientName ?? "",
    phone: initialData?.phone ?? "",
    email: initialData?.email ?? "",
    country: initialData?.country ?? "",
    state: initialData?.state ?? "",
    city: initialData?.city ?? "",
    postalCode:
      initialData?.postalCode ?? "",
    addressLine1:
      initialData?.addressLine1 ?? "",
    addressLine2:
      initialData?.addressLine2 ?? "",
    isDefault:
      initialData?.isDefault ?? false,
  });

  const update = (
    key: keyof typeof form,
    value: string | boolean
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit(form);
      }}
      className="space-y-5 text-slate-900 dark:text-white"
    >
      <input
        value={form.label}
        onChange={(e) =>
          update("label", e.target.value)
        }
        placeholder="Label (Home, Office...)"
        className={fieldClass}
      />

      <input
        value={form.recipientName}
        onChange={(e) =>
          update(
            "recipientName",
            e.target.value
          )
        }
        placeholder="Recipient Name"
        className={fieldClass}
      />

      <InternationalPhoneInput
        value={form.phone}
        onChange={(value) =>
          update("phone", value)
        }
      />

      <input
        type="email"
        value={form.email}
        onChange={(e) =>
          update("email", e.target.value)
        }
        placeholder="Email"
        className={fieldClass}
      />

      <CountrySelect
        value={form.country}
        onChange={(value) =>
          update("country", value)
        }
      />

      <input
        value={form.state}
        onChange={(e) =>
          update("state", e.target.value)
        }
        placeholder="State"
        className={fieldClass}
      />

      <input
        value={form.city}
        onChange={(e) =>
          update("city", e.target.value)
        }
        placeholder="City"
        className={fieldClass}
      />

      <input
        value={form.postalCode}
        onChange={(e) =>
          update(
            "postalCode",
            e.target.value
          )
        }
        placeholder="Postal Code"
        className={fieldClass}
      />

      <textarea
        value={form.addressLine1}
        onChange={(e) =>
          update(
            "addressLine1",
            e.target.value
          )
        }
        placeholder="Address Line 1"
        rows={3}
        className={`${fieldClass} resize-none`}
      />

      <textarea
        value={form.addressLine2}
        onChange={(e) =>
          update(
            "addressLine2",
            e.target.value
          )
        }
        placeholder="Address Line 2 (Optional)"
        rows={3}
        className={`${fieldClass} resize-none`}
      />

      <label className="flex cursor-pointer select-none items-center gap-3 text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) =>
            update(
              "isDefault",
              e.target.checked
            )
          }
          className="h-4 w-4 accent-purple-600"
        />

        Make Default Address
      </label>

      <button
        type="submit"
        className="w-full rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-purple-700"
      >
        Save Address
      </button>
    </form>
  );
}