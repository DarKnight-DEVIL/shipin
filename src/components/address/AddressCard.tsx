"use client";

import { useState } from "react";
import { MoreHorizontal, Star } from "lucide-react";
import { toast } from "sonner";

import {
  deleteAddress,
  setDefaultAddress,
} from "@/lib/addressBook";
import { auth } from "@/lib/firebase";
import type { Address } from "@/types/address";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    const user = auth.currentUser;
    if (!user) return;

    setBusy(true);
    try {
      await deleteAddress(user.uid, address.id);
      await onRefresh();
      toast.success("Address removed");
    } catch {
      toast.error("Couldn't delete address");
    } finally {
      setBusy(false);
      setShowDeleteDialog(false);
    }
  }

  async function makeDefault() {
    const user = auth.currentUser;
    if (!user) return;

    setBusy(true);
    setMenuOpen(false);
    try {
      await setDefaultAddress(user.uid, address.id);
      await onRefresh();
      toast.success("Default address updated");
    } catch {
      toast.error("Couldn't update default");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`group relative rounded-[14px] border bg-[var(--card)] p-5 transition-colors ${
        address.isDefault
          ? "border-[var(--border-strong)]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      }`}
    >
      {/* Top row */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[13px] font-semibold text-[var(--foreground)]">
              {address.label || "Address"}
            </h2>
            {address.isDefault && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--muted)]">
                <Star size={10} className="fill-current text-[var(--accent)]" />
                Default
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            {address.recipientName}
          </p>
        </div>

        {/* Actions menu */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={busy}
            className="app-iconbtn -mr-1.5 -mt-1 h-7 w-7"
            aria-label="Address options"
          >
            <MoreHorizontal size={18} />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg shadow-slate-950/10 dark:shadow-black/40">
                {!address.isDefault && (
                  <button
                    type="button"
                    onClick={makeDefault}
                    className="flex w-full px-3 py-2 text-left text-[12px] text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                  >
                    Set as default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(address);
                  }}
                  className="flex w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowDeleteDialog(true);
                  }}
                  className="flex w-full px-3 py-2 text-left text-[12px] text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Address body */}
      <div className="space-y-0.5 text-[12px] leading-5 text-[var(--muted)]">
        <p>{address.addressLine1}</p>
        {address.addressLine2 && <p>{address.addressLine2}</p>}
        <p>
          {[address.city, address.state, address.postalCode]
            .filter(Boolean)
            .join(", ")}
        </p>
        <p>{address.country}</p>
        {address.phone && (
          <p className="pt-1.5 text-[var(--muted-soft)]">
            {address.phone}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete this address?"
        message="It will be removed from your address book. Requests already using it are not affected."
        confirmText="Delete"
        danger
        onCancel={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}