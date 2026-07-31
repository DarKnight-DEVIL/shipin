"use client";

import {
  deleteAddress,
  setDefaultAddress,
} from "@/lib/addressBook";

import { auth } from "@/lib/firebase";
import type { Address } from "@/types/address";

interface Props {
  address: Address;
  onEdit: (address: Address) => void;
  onRefresh: () => Promise<void>;
}

export default function AddressCard({
  address,
  onEdit,
  onRefresh,
}: Props) {
  async function handleDelete() {
    const user = auth.currentUser;

    if (!user) return;

    if (
      !confirm(
        "Delete this address?"
      )
    ) {
      return;
    }

    await deleteAddress(
      user.uid,
      address.id
    );

    await onRefresh();
  }

  async function makeDefault() {
    const user = auth.currentUser;

    if (!user) return;

    await setDefaultAddress(
      user.uid,
      address.id
    );

    await onRefresh();
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

      <div className="mb-5 flex justify-between">

        <h2 className="text-xl font-bold text-slate-950 dark:text-white">
          {address.label}

          {address.isDefault && (
            <span className="ml-3 text-sm font-semibold text-green-600 dark:text-green-400">
              ★ Default
            </span>
          )}
        </h2>

      </div>

      <div className="space-y-1 text-slate-600 dark:text-slate-300">
        <p className="font-medium text-slate-800 dark:text-slate-200">
          {address.recipientName}
        </p>

        <p>{address.phone}</p>
        <p>{address.addressLine1}</p>

        {address.addressLine2 && (
          <p>{address.addressLine2}</p>
        )}

        <p>
          {address.city}, {address.state}
        </p>

        <p>{address.country}</p>
        <p>{address.postalCode}</p>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">

        {!address.isDefault && (
          <button
            type="button"
            onClick={makeDefault}
            className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
          >
            Set Default
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            onEdit(address)
          }
          className="rounded-xl bg-amber-500 px-4 py-2 font-medium text-white transition hover:bg-amber-600"
        >
          Edit
        </button>

        <button
          type="button"
          onClick={handleDelete}
          className="rounded-xl bg-red-600 px-4 py-2 font-medium text-white transition hover:bg-red-700"
        >
          Delete
        </button>

      </div>
    </div>
  );
}