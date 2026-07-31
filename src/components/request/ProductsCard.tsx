"use client";

import type {
  Request,
  RequestItem,
  AdditionalItemRequest,
} from "@/types/request";

interface Props {
  request: Request;
}

export default function ProductsCard({
  request,
}: Props) {
  const items = request.items || [];
  const quote = request.quote;

  const originalItems =
    quote?.items?.map(
      (quoteItem, index) => ({
        ...items[index],
        ...quoteItem,
      })
    ) ?? items;

  const additionalItems =
    request.additionalItemRequests || [];

  return (
    <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

      <h2 className="mb-6 text-2xl font-semibold text-slate-950 dark:text-white">
        Products
      </h2>

      <div className="space-y-6">

        {/* ORIGINAL ORDER ITEMS */}

        {originalItems.map(
          (item, index) => {
            const quoteItem =
              request.quote?.items?.[
                index
              ];

            return (
              <OriginalProductCard
                key={`original-${index}`}
                item={item}
                quoteItem={
                  quoteItem
                }
              />
            );
          }
        )}


        {/* ADDITIONAL ITEM REQUESTS */}

        {additionalItems.map(
          (additionalItem) => (
            <AdditionalProductCard
              key={
                additionalItem.id
              }
              additionalItem={
                additionalItem
              }
            />
          )
        )}

      </div>

    </div>
  );
}


/* =========================================
   ORIGINAL PRODUCT
========================================= */

function OriginalProductCard({
  item,
  quoteItem,
}: {
  item: RequestItem;

  quoteItem?: {
    unitPrice?: number;
    quantity?: number;
    subtotal?: number;
  };
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/40">

      <div className="flex flex-col gap-6 md:flex-row md:justify-between">

        <ProductDetails
          item={item}
        />

        {quoteItem && (
          <div className="w-full rounded-xl bg-slate-100 p-4 dark:bg-slate-800 md:w-64">

            <PriceRow
              label="Unit Price"
              value={
                quoteItem.unitPrice
              }
            />

            <PriceRow
              label="Quantity"
              value={
                quoteItem.quantity
              }
              money={false}
            />

            <hr className="my-3 border-slate-200 dark:border-slate-700" />

            <PriceRow
              label="Subtotal"
              value={
                quoteItem.subtotal
              }
              highlight
            />

          </div>
        )}

      </div>

    </div>
  );
}


/* =========================================
   ADDITIONAL PRODUCT
========================================= */

function AdditionalProductCard({
  additionalItem,
}: {
  additionalItem: AdditionalItemRequest;
}) {
  const quote =
    additionalItem.quote;

  /*
   * Prefer the supplementary quote.
   * Fall back to legacy fields so older
   * additional-item requests still work.
   */

  const unitPrice =
    quote?.unitPrice ??
    additionalItem.unitPrice;

  const subtotal =
    quote?.subtotal ??
    additionalItem.subtotal;

  const hasPricing =
    typeof unitPrice === "number" &&
    typeof subtotal === "number";

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5">

      <div className="flex flex-col gap-6 md:flex-row md:justify-between">

        <div className="flex-1">

          {/* BADGE */}

          <div className="mb-3">

            <span className="inline-flex rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-700 dark:text-purple-300">
              Additional Item
            </span>

          </div>


          {/* PRODUCT */}

          <h3 className="text-xl font-semibold text-slate-950 dark:text-white">
            {
              additionalItem
                .item.name
            }
          </h3>

          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Quantity:{" "}
            {
              additionalItem
                .item.quantity
            }
          </p>

          {additionalItem.item
            .url && (
            <>

              <p className="text-slate-500 text-sm break-all mt-3">
                {
                  additionalItem
                    .item.url
                }
              </p>

              <a
                href={
                  additionalItem
                    .item.url
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex mt-3 rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2 text-sm font-medium text-white"
              >
                View Product
              </a>

            </>
          )}

        </div>


        {/* ADDITIONAL ITEM PRICE */}

        {hasPricing && (
          <div className="w-full rounded-xl bg-slate-100 p-4 dark:bg-slate-800 md:w-64">

            <PriceRow
              label="Unit Price"
              value={unitPrice}
            />

            <PriceRow
              label="Quantity"
              value={
                additionalItem
                  .item.quantity
              }
              money={false}
            />

            <hr className="my-3 border-slate-200 dark:border-slate-700" />

            <PriceRow
              label="Subtotal"
              value={subtotal}
              highlight
            />

          </div>
        )}

      </div>


      {/* ADDITIONAL ITEM TRACKER */}

      <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">

        <h4 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
          Item Progress
        </h4>

        <AdditionalItemTracker
          status={
            additionalItem.status
          }
        />

      </div>

    </div>
  );
}


/* =========================================
   ADDITIONAL ITEM TRACKER
========================================= */

function AdditionalItemTracker({
  status,
}: {
  status:
    AdditionalItemRequest["status"];
}) {

  const steps = [
    {
      key: "pending",
      label: "Requested",
    },
    {
      key: "awaiting_payment",
      label: "Payment",
    },
    {
      key: "paid",
      label: "Paid",
    },
    {
      key: "purchased",
      label: "Purchased",
    },
    {
      key: "warehouse_received",
      label:
        "Warehouse Received",
    },
    {
      key: "packed",
      label: "Packed",
    },
  ];

  const statusOrder =
    steps.map(
      (step) => step.key
    );

  /*
   * Approved is treated as being
   * before awaiting_payment.
   */
  const normalizedStatus =
    status === "approved"
      ? "awaiting_payment"
      : status;

  const currentIndex =
    statusOrder.indexOf(
      normalizedStatus
    );

  /*
   * Cancelled/rejected items should
   * not display a fake completed
   * progress tracker.
   */
  if (
    status === "cancelled" ||
    status === "rejected"
  ) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        This additional item request
        was{" "}
        {status === "cancelled"
          ? "cancelled"
          : "rejected"}.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">

      {steps.map(
        (step, index) => {

          const completed =
            currentIndex > index;

          const current =
            currentIndex ===
            index;

          return (
            <div
              key={step.key}
              className={`
                rounded-lg border p-3
                ${
                  completed
                    ? "border-green-500/20 bg-green-500/10"
                    : current
                    ? "border-purple-500/30 bg-purple-500/10"
                    : "border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50"
                }
              `}
            >

              <div
                className={`
                  text-xs font-semibold
                  ${
                    completed
                      ? "text-green-600 dark:text-green-400"
                      : current
                      ? "text-purple-700 dark:text-purple-300"
                      : "text-slate-500"
                  }
                `}
              >
                {completed
                  ? "✓"
                  : current
                  ? "●"
                  : "○"}{" "}
                {step.label}
              </div>

            </div>
          );
        }
      )}

    </div>
  );
}


/* =========================================
   PRODUCT DETAILS
========================================= */

function ProductDetails({
  item,
}: {
  item: RequestItem;
}) {
  return (
    <div>

      <h3 className="text-xl font-semibold text-slate-950 dark:text-white">
        {item.name}
      </h3>

      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Quantity:{" "}
        {item.quantity}
      </p>

      {item.url && (
        <>

          <p className="text-slate-500 text-sm break-all mt-3">
            {item.url}
          </p>

          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex mt-3 rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2 text-sm font-medium text-white"
          >
            View Product
          </a>

        </>
      )}

    </div>
  );
}


/* =========================================
   PRICE ROW
========================================= */

function PriceRow({
  label,
  value,
  highlight = false,
  money = true,
}: {
  label: string;
  value?: number;
  highlight?: boolean;
  money?: boolean;
}) {
  return (
    <div className="flex justify-between py-2">

      <span className="text-slate-600 dark:text-slate-400">
        {label}
      </span>

      <span
        className={`font-semibold ${
          highlight
            ? "text-green-600 dark:text-green-400"
            : "text-slate-950 dark:text-white"
        }`}
      >
        {money
          ? `$${(
              value ?? 0
            ).toFixed(2)}`
          : value ?? "-"}
      </span>

    </div>
  );
}