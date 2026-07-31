"use client";

import { useState } from "react";
import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import type {
  AdditionalItemRequest,
  Request,
} from "@/types/request";

import Section from "@/components/ui/Section";
import ProductCard from "../ProductCard";

interface Props {
  request: Request;
}

export default function ProductsPanel({
  request,
}: Props) {
  const items =
    request.items || [];

  const additionalRequests =
    request.additionalItemRequests || [];

  const pendingRequests =
    additionalRequests.filter(
      (item) =>
        item.status === "pending"
    );

  return (
    <div className="space-y-8">

      {/* =====================================
          ORIGINAL PRODUCTS
      ====================================== */}

      <Section
        title="Products"
        subtitle={`${items.length} product${
          items.length !== 1
            ? "s"
            : ""
        }`}
      >
        {items.length === 0 ? (
          <div className="text-slate-400">
            No products in this request.
          </div>
        ) : (
          <div className="space-y-6">
            {items.map((item, index) => {
              const quoteItem =
                request.quote?.items?.[index];

              return (
                <ProductCard
                  key={index}
                  item={{
                    ...item,

                    unitPrice:
                      quoteItem?.unitPrice ??
                      item.unitPrice,

                    subtotal:
                      quoteItem?.subtotal ??
                      item.subtotal,
                  }}
                  editable
                />
              );
            })}
          </div>
        )}
      </Section>

      {/* =====================================
          ADDITIONAL ITEM REQUESTS
      ====================================== */}

      <Section
        title="Additional Item Requests"
        subtitle={
          pendingRequests.length > 0
            ? `${pendingRequests.length} pending request${
                pendingRequests.length !==
                1
                  ? "s"
                  : ""
              }`
            : "No pending requests"
        }
      >
        {additionalRequests.length ===
        0 ? (
          <div className="text-slate-400">
            The customer has not
            requested any additional
            items.
          </div>
        ) : (
          <div className="space-y-5">
            {additionalRequests.map(
              (additionalRequest) => (
                <AdditionalItemCard
                  key={
                    additionalRequest.id
                  }
                  request={request}
                  additionalRequest={
                    additionalRequest
                  }
                />
              )
            )}
          </div>
        )}
      </Section>

    </div>
  );
}

/* =========================================
    ADDITIONAL ITEM ADMIN CARD
========================================= */

function AdditionalItemCard({
  request,
  additionalRequest,
}: {
  request: Request;

  additionalRequest:
    AdditionalItemRequest;
}) {
  const [unitPrice, setUnitPrice] =
    useState(
      additionalRequest.unitPrice?.toString() ??
        ""
    );

  const [processing, setProcessing] =
    useState(false);

  const subtotal =
    (Number(unitPrice) || 0) *
    additionalRequest.item.quantity;

  /*
   * Service fee for this additional-item quote.
   *
   * Currently set to 0 because the original request
   * already has its main service fee.
   *
   * We can change this later if ShipIN should charge
   * a separate service fee for additional purchases.
   */
  const serviceFee = 0;

  /*
   * This fee is applied only if the
   * request was already packed when
   * the customer requested the item.
   */
  const repackingFee =
    additionalRequest.orderChangeHold
      ? 2
      : 0;

  const storageFee =
    additionalRequest.storageFee ?? 0;

  const totalDue =
    subtotal +
    serviceFee +
    repackingFee +
    storageFee;

  async function handleApprove() {
    const price =
      Number(unitPrice);

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      alert(
        "Enter a valid unit price."
      );

      return;
    }

    try {
      setProcessing(true);

      const requestRef = doc(
        db,
        "requests",
        request.id
      );

      /*
       * Get the latest version from
       * Firestore before updating.
       *
       * This prevents us from using
       * stale request data.
       */
      const snapshot =
        await getDoc(requestRef);

      if (!snapshot.exists()) {
        throw new Error(
          "Request not found."
        );
      }

      const latestRequest =
        snapshot.data() as Request;

      const latestAdditionalRequests =
        latestRequest
          .additionalItemRequests ||
        [];

      /*
       * Update this specific add-item
       * request.
       */
      const updatedAdditionalRequests =
        latestAdditionalRequests.map(
          (item) => {
            if (
              item.id !==
              additionalRequest.id
            ) {
              return item;
            }

            return {
              ...item,

              status:
                "awaiting_payment" as const,

              /*
               * Keep these fields for compatibility
               * with the existing PayPal API.
               */
              unitPrice:
                price,

              subtotal,

              serviceFee,

              repackingFee,

              storageFee,

              totalDue,

              /*
               * New supplementary quote.
               *
               * This belongs only to this additional
               * item and does NOT modify request.quote.
               */
              quote: {
                unitPrice:
                  price,

                subtotal,

                serviceFee,

                repackingFee,

                storageFee,

                totalDue,

                createdAt:
                  new Date(),

                expiresAt:
                  new Date(
                    Date.now() +
                      24 * 60 * 60 * 1000
                  ),
              },

              reviewedAt:
                new Date(),

              approvedAt:
                new Date(),
            };
          }
        );

      await updateDoc(
        requestRef,
        {
          additionalItemRequests:
            updatedAdditionalRequests,
            
          updatedAt:
            new Date(),
        }
      );

      alert(
        "Additional item approved. Additional payment is now pending."
      );
    } catch (error) {
      console.error(
        "Approve additional item error:",
        error
      );

      alert(
        "Unable to approve the additional item."
      );
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject() {
    const confirmed =
      window.confirm(
        "Reject this additional item request?"
      );

    if (!confirmed) {
      return;
    }

    try {
      setProcessing(true);

      const requestRef = doc(
        db,
        "requests",
        request.id
      );

      const snapshot =
        await getDoc(requestRef);

      if (!snapshot.exists()) {
        throw new Error(
          "Request not found."
        );
      }

      const latestRequest =
        snapshot.data() as Request;

      const updatedAdditionalRequests =
        (
          latestRequest
            .additionalItemRequests ||
          []
        ).map((item) =>
          item.id ===
          additionalRequest.id
            ? {
                ...item,

                status:
                  "rejected" as const,

                reviewedAt:
                  new Date(),
              }
            : item
        );

      /*
       * If every additional item is now either
       * packed, rejected or cancelled, there is
       * nothing left for the main shipment to
       * wait for.
       */
      const allAdditionalItemsResolved =
        updatedAdditionalRequests.every(
          (item) =>
            item.status === "packed" ||
            item.status === "rejected" ||
            item.status === "cancelled"
        );

      const now = new Date();

      await updateDoc(
        requestRef,
        {
          additionalItemRequests:
            updatedAdditionalRequests,

          /*
           * Remove the temporary shipment hold
           * when no unresolved additional items
           * remain.
           */
          ...(allAdditionalItemsResolved
            ? {
                orderChange: {
                  ...(latestRequest.orderChange || {
                    active: false,
                  }),

                  active: false,

                  completedAt: now,
                },
              }
            : {}),

          updatedAt: now,
        }
      );

      alert(
        "Additional item request rejected."
      );
    } catch (error) {
      console.error(
        "Reject additional item error:",
        error
      );

      alert(
        "Unable to reject the additional item request."
      );
    } finally {
      setProcessing(false);
    }
  }

  async function handleStatusUpdate(
    nextStatus:
      | "purchased"
      | "warehouse_received"
      | "packed"
  ) {
    const labels = {
      purchased: "Purchased",
      warehouse_received:
        "Warehouse Received",
      packed: "Packed",
    };

    const confirmed =
      window.confirm(
        `Mark this additional item as "${labels[nextStatus]}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setProcessing(true);

      const requestRef = doc(
        db,
        "requests",
        request.id
      );

      const snapshot =
        await getDoc(requestRef);

      if (!snapshot.exists()) {
        throw new Error(
          "Request not found."
        );
      }

      const latestRequest =
        snapshot.data() as Request;

      const now = new Date();

      const updatedAdditionalRequests =
        (
          latestRequest
            .additionalItemRequests || []
        ).map((item) => {
          if (
            item.id !==
            additionalRequest.id
          ) {
            return item;
          }

          if (
            nextStatus ===
            "purchased"
          ) {
            return {
              ...item,
              status:
                "purchased" as const,
              purchasedAt: now,
            };
          }

          if (
            nextStatus ===
            "warehouse_received"
          ) {
            return {
              ...item,
              status:
                "warehouse_received" as const,
              warehouseReceivedAt:
                now,
            };
          }

          return {
            ...item,
            status:
              "packed" as const,
            packedAt: now,
          };
        });

      /*
       * Check whether every additional item
       * has reached a terminal state.
       *
       * Packed items are ready with the main
       * shipment. Rejected/cancelled items
       * should not keep the shipment on hold.
       */
      const allAdditionalItemsResolved =
        updatedAdditionalRequests.every(
          (item) =>
            item.status === "packed" ||
            item.status === "rejected" ||
            item.status === "cancelled"
        );

      await updateDoc(
        requestRef,
        {
          additionalItemRequests:
            updatedAdditionalRequests,

          /*
           * Release "Waiting for Additional Items"
           * only when there are no unfinished
           * additional items remaining.
           */
          ...(allAdditionalItemsResolved
            ? {
                orderChange: {
                  ...(latestRequest.orderChange || {
                    active: false,
                  }),

                  active: false,

                  completedAt: now,
                },
              }
            : {}),

          updatedAt: now,
        }
      );

      alert(
        `Additional item marked as ${labels[nextStatus]}.`
      );
    } catch (error) {
      console.error(
        "Additional item status update error:",
        error
      );

      alert(
        "Unable to update the additional item status."
      );
    } finally {
      setProcessing(false);
    }
  }

  const isPending =
    additionalRequest.status ===
    "pending";

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950 p-5">

      <div className="flex flex-col gap-5">

        <div>
          <div className="flex items-center justify-between gap-4">

            <h3 className="text-lg font-semibold text-white">
              {
                additionalRequest
                  .item.name
              }
            </h3>

            <StatusBadge
              status={
                additionalRequest.status
              }
            />

          </div>

          <div className="mt-4 space-y-2 text-sm">

            <InfoRow
              label="Quantity"
              value={String(
                additionalRequest
                  .item.quantity
              )}
            />

            {additionalRequest.item
              .url && (
              <div>
                <p className="text-slate-500">
                  Product URL
                </p>

                <a
                  href={
                    additionalRequest
                      .item.url
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-purple-400 hover:text-purple-300"
                >
                  {
                    additionalRequest
                      .item.url
                  }
                </a>
              </div>
            )}

          </div>
        </div>

        {isPending && (
          <div className="border-t border-slate-800 pt-5">

            <label className="mb-2 block text-sm text-slate-400">
              Unit Price ($)
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={(e) =>
                setUnitPrice(
                  e.target.value
                )
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white"
            />

            <div className="mt-4 rounded-xl bg-slate-900 p-4">

              <InfoRow
                label="Product Subtotal"
                value={`$${subtotal.toFixed(2)}`}
              />

              {serviceFee > 0 && (
                <InfoRow
                  label="Service Fee"
                  value={`$${serviceFee.toFixed(2)}`}
                />
              )}

              {repackingFee > 0 && (
                <InfoRow
                  label="Repacking Fee"
                  value={`$${repackingFee.toFixed(2)}`}
                />
              )}

              {storageFee > 0 && (
                <InfoRow
                  label="Storage Fee"
                  value={`$${storageFee.toFixed(2)}`}
                />
              )}

              <div className="mt-3 border-t border-slate-700 pt-3">
                <InfoRow
                  label="Additional Quote Total"
                  value={`$${totalDue.toFixed(2)}`}
                />
              </div>

            </div>

            {repackingFee > 0 && (
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300">
                This order was already
                packed when the customer
                requested the additional
                item. A $2 repacking fee
                applies.
              </div>
            )}

            <div className="mt-5 flex gap-3">

              <button
                type="button"
                disabled={processing}
                onClick={
                  handleApprove
                }
                className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {processing
                  ? "Processing..."
                  : "Approve"}
              </button>

              <button
                type="button"
                disabled={processing}
                onClick={
                  handleReject
                }
                className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>

            </div>

          </div>
        )}

        {!isPending && (
          <div className="border-t border-slate-800 pt-4">

            {additionalRequest.unitPrice !==
              undefined && (
              <InfoRow
                label="Unit Price"
                value={`$${additionalRequest.unitPrice.toFixed(
                  2
                )}`}
              />
            )}

            {additionalRequest.subtotal !==
              undefined && (
              <InfoRow
                label="Product Subtotal"
                value={`$${additionalRequest.subtotal.toFixed(
                  2
                )}`}
              />
            )}

            {additionalRequest.totalDue !==
              undefined && (
              <InfoRow
                label="Additional Amount"
                value={`$${additionalRequest.totalDue.toFixed(
                  2
                )}`}
              />
            )}


            {/* =================================
                ADDITIONAL ITEM ADMIN ACTIONS
            ================================= */}

            {additionalRequest.status ===
              "awaiting_payment" && (
              <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">

                <p className="text-sm font-medium text-amber-300">
                  Waiting for customer payment.
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  This item will automatically
                  become paid after successful
                  PayPal payment.
                </p>

              </div>
            )}


            {additionalRequest.status ===
              "paid" && (
              <button
                type="button"
                disabled={processing}
                onClick={() =>
                  handleStatusUpdate(
                    "purchased"
                  )
                }
                className="mt-5 w-full rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {processing
                  ? "Updating..."
                  : "Mark Purchased"}
              </button>
            )}


            {additionalRequest.status ===
              "purchased" && (
              <button
                type="button"
                disabled={processing}
                onClick={() =>
                  handleStatusUpdate(
                    "warehouse_received"
                  )
                }
                className="mt-5 w-full rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {processing
                  ? "Updating..."
                  : "Mark Warehouse Received"}
              </button>
            )}


            {additionalRequest.status ===
              "warehouse_received" && (
              <button
                type="button"
                disabled={processing}
                onClick={() =>
                  handleStatusUpdate(
                    "packed"
                  )
                }
                className="mt-5 w-full rounded-xl bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {processing
                  ? "Updating..."
                  : "Mark packed"}
              </button>
            )}


            {additionalRequest.status ===
              "packed" && (
              <div className="mt-5 rounded-xl border border-green-500/20 bg-green-500/10 p-4">

                <p className="text-sm font-medium text-green-400">
                  ✓ Additional item packed
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  This item is ready with the
                  customer's order.
                </p>

              </div>
            )}

          </div>
        )}

      </div>

    </div>
  );
}

/* =========================================
    SMALL HELPERS
========================================= */

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-slate-400">
        {label}
      </span>

      <span className="font-medium text-white">
        {value}
      </span>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const label =
    status.replaceAll(
      "_",
      " "
    );

  return (
    <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase text-slate-300">
      {label}
    </span>
  );
}