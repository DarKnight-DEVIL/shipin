"use client";

import type { Address } from "@/types/address";

interface Props {
  addresses: Address[];
  selected?: Address;
  onSelect: (address: Address) => void;
  onAddNew: () => void;
}

export default function AddressPicker({
  addresses,
  selected,
  onSelect,
  onAddNew,
}: Props) {
  return (
    <div className="space-y-4">
      {addresses.map((address) => {
        const isSelected =
          selected?.id === address.id;

        return (
          <button
            key={address.id}
            type="button"
            onClick={() =>
              onSelect(address)
            }
            className={`w-full rounded-xl border p-4 text-left transition ${
              isSelected
                ? "border-purple-500 bg-purple-50 ring-1 ring-purple-500/20 dark:bg-purple-500/10"
                : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800/60"
            }`}
          >
            <div className="flex justify-between gap-4">
              <div className="min-w-0">

                <h3 className="font-semibold text-slate-950 dark:text-white">
                  {address.label}

                  {address.isDefault && (
                    <span className="ml-2 text-sm text-green-600 dark:text-green-400">
                      ★ Default
                    </span>
                  )}
                </h3>

                <p className="mt-2 text-slate-700 dark:text-slate-300">
                  {address.recipientName}
                </p>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {address.addressLine1}
                </p>

                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {address.city}, {address.state}
                </p>

              </div>

              {isSelected && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white">
                  ✓
                </div>
              )}
            </div>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onAddNew}
        className="w-full rounded-xl border-2 border-dashed border-slate-300 py-4 font-medium text-slate-600 transition hover:border-purple-500 hover:bg-purple-50 hover:text-purple-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-purple-500 dark:hover:bg-purple-500/10 dark:hover:text-purple-300"
      >
        + Add New Address
      </button>
    </div>
  );
}