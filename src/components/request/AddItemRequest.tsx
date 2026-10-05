"use client";

import { useState } from "react";
import {
  arrayUnion,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import type { Request } from "@/types/request";

interface Props {
  request: Request;
}

const ALLOWED_STATUSES = [
  "paid",
  "purchased",
  "warehouse_received",
  "ready_for_international_shipping",
  "packed",
];

export default function AddItemRequest({ request }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const isBlocked = !ALLOWED_STATUSES.includes(request.status);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isBlocked) {
      toast.warning(
        "Additional items can only be requested before the shipment has been dispatched."
      );
      return;
    }

    if (!name.trim()) {
      toast.warning("Please enter the product name.");
      return;
    }

    if (!url.trim()) {
      toast.warning("Please enter the product URL.");
      return;
    }

    if (quantity < 1) {
      toast.warning("Quantity must be at least 1.");
      return;
    }

    try {
      setSubmitting(true);

      const additionalItemId = crypto.randomUUID();
      const requestRef = doc(db, "requests", request.id);
      const wasPacked = request.status === "packed";

      await updateDoc(requestRef, {
        additionalItemRequests: arrayUnion({
          id: additionalItemId,
          item: {
            name: name.trim(),
            url: url.trim(),
            quantity,
          },
          status: "pending",
          repackingFee: 0,
          storageFee: 0,
          amountPaid: 0,
          orderChangeHold: true,
          requestedAt: new Date(),
        }),
        orderChange: {
          active: true,
          requiresRepacking: wasPacked,
          repackingFee: wasPacked ? 2 : 0,
          storageFee: 0,
          storageFeeApplied: false,
          startedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });

      setName("");
      setUrl("");
      setQuantity(1);
      setOpen(false);

      toast.success(
        "Your additional item request has been submitted for review."
      );
    } catch (error) {
      console.error("Add item request error:", error);
      toast.error("Unable to submit request.", {
        description:
          error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (isBlocked) return null;

  return (
    <section className="shipin-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">
            Need another item?
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Request before your shipment is dispatched.
          </p>
        </div>

        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            + Add item
          </button>
        )}
      </div>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="mt-5 space-y-4 border-t border-slate-200 pt-5 dark:border-slate-800"
        >
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Product name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Product name"
              className="shipin-input"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Product URL
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="shipin-input"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Quantity
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.max(1, Number(e.target.value)))
              }
              className="shipin-input"
            />
          </div>

          {request.status === "packed" ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-800 dark:text-amber-300">
              Parcel is already packed. A $2 repacking fee may apply if
              approved. Storage charges may also apply.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
              Shipment will be held while this item is reviewed, purchased,
              received, and packed.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="shipin-btn-primary px-5 py-2.5 text-sm disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit request"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setOpen(false)}
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}