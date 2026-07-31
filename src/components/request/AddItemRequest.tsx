"use client";

import { useState } from "react";
import {
  arrayUnion,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

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

export default function AddItemRequest({
  request,
}: Props) {
  const [open, setOpen] =
    useState(false);

  const [name, setName] =
    useState("");

  const [url, setUrl] =
    useState("");

  const [quantity, setQuantity] =
    useState(1);

  const [submitting, setSubmitting] =
    useState(false);

  const isBlocked =
    !ALLOWED_STATUSES.includes(
      request.status
    );

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    if (isBlocked) {
      alert(
        "Additional items can only be requested before the shipment has been dispatched."
      );
      return;
    }

    if (!name.trim()) {
      alert(
        "Please enter the product name."
      );
      return;
    }

    if (!url.trim()) {
      alert(
        "Please enter the product URL."
      );
      return;
    }

    if (quantity < 1) {
      alert(
        "Quantity must be at least 1."
      );
      return;
    }

    try {
      setSubmitting(true);

      const additionalItemId =
        crypto.randomUUID();

      const requestRef = doc(
        db,
        "requests",
        request.id
      );

      /*
       * The original request status remains
       * untouched.
       *
       * orderChange.active acts as a temporary
       * "Waiting for Additional Items" overlay.
       */
      const wasPacked =
        request.status === "packed";

      await updateDoc(
        requestRef,
        {
          additionalItemRequests:
            arrayUnion({
              id: additionalItemId,

              item: {
                name:
                  name.trim(),

                url:
                  url.trim(),

                quantity,
              },

              status:
                "pending",

              /*
               * Fees are calculated/confirmed
               * during admin review.
               */
              repackingFee: 0,

              storageFee: 0,

              amountPaid: 0,

              /*
               * Every additional item now
               * places the shipment on an
               * order-change hold.
               */
              orderChangeHold:
                true,

              requestedAt:
                new Date(),
            }),

          /*
           * Activate the temporary hold for
           * EVERY allowed order stage.
           *
           * Only a parcel that was already
           * packed requires repacking.
           */
          orderChange: {
            active: true,

            requiresRepacking:
              wasPacked,

            repackingFee:
              wasPacked
                ? 2
                : 0,

            storageFee: 0,

            storageFeeApplied:
              false,

            startedAt:
              serverTimestamp(),
          },

          updatedAt:
            serverTimestamp(),
        }
      );

      setName("");
      setUrl("");
      setQuantity(1);
      setOpen(false);

      alert(
        "Your additional item request has been submitted for review."
      );
    } catch (error) {
      console.error(
        "Add item request error:",
        error
      );

      alert(
        "Unable to submit the additional item request."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (isBlocked) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

      <div className="flex items-center justify-between gap-4">

        <div>
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
            Need Another Item?
          </h2>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Request an additional product
            before your shipment is
            dispatched.
          </p>
        </div>

        {!open && (
          <button
            type="button"
            onClick={() =>
              setOpen(true)
            }
            className="shrink-0 rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white hover:bg-purple-700"
          >
            + Add Item
          </button>
        )}

      </div>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4 border-t border-slate-200 pt-6 dark:border-slate-800"
        >

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-400">
              Product Name
            </label>

            <input
              value={name}
              onChange={(e) =>
                setName(
                  e.target.value
                )
              }
              placeholder="Product name"
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-400">
              Product URL
            </label>

            <input
              value={url}
              onChange={(e) =>
                setUrl(
                  e.target.value
                )
              }
              placeholder="https://..."
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-400">
              Quantity
            </label>

            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) =>
                setQuantity(
                  Math.max(
                    1,
                    Number(
                      e.target.value
                    )
                  )
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
            />
          </div>

          {/* PACKED ORDER WARNING */}

          {request.status ===
            "packed" && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-800 dark:text-amber-300">

              Your parcel has already
              been packed. If this item
              request is approved, a $2
              repacking fee will apply.

              Additional storage charges
              may apply according to the
              order-change storage policy.

            </div>
          )}

          {/* GENERAL HOLD INFORMATION */}

          {request.status !==
            "packed" && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 text-sm leading-6 text-slate-700 dark:text-slate-300">

              Your shipment will be
              temporarily placed on hold
              while this additional item
              is reviewed, purchased,
              received and packed.

            </div>
          )}

          <div className="flex gap-3">

            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {submitting
                ? "Submitting..."
                : "Submit Item Request"}
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                setOpen(false)
              }
              className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>

          </div>

        </form>
      )}

    </div>
  );
}