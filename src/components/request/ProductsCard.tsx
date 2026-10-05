"use client";

import type {
  Request,
  RequestItem,
  AdditionalItemRequest,
} from "@/types/request";

interface Props {
  request: Request;
}

export default function ProductsCard({ request }: Props) {
  const items = request.items || [];
  const quote = request.quote;

  const originalItems =
    quote?.items?.map((quoteItem, index) => ({
      ...items[index],
      ...quoteItem,
    })) ?? items;

  const additionalItems = request.additionalItemRequests || [];

  return (
    <section className="shipin-surface p-5 sm:p-6">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">
          Products
        </h2>
        <span className="text-xs text-slate-500">
          {originalItems.length + additionalItems.length} item
          {originalItems.length + additionalItems.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {originalItems.map((item, index) => {
          const quoteItem = request.quote?.items?.[index];
          return (
            <OriginalProductRow
              key={`original-${index}`}
              item={item}
              quoteItem={quoteItem}
            />
          );
        })}

        {additionalItems.map((additionalItem) => (
          <AdditionalProductRow
            key={additionalItem.id}
            additionalItem={additionalItem}
          />
        ))}
      </div>
    </section>
  );
}

function OriginalProductRow({
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
    <div className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <ProductMeta item={item} />
      {quoteItem && (
        <div className="shrink-0 space-y-1.5 text-sm sm:w-44 sm:text-right">
          <MetaRow
            label="Unit"
            value={`$${(quoteItem.unitPrice ?? 0).toFixed(2)}`}
          />
          <MetaRow label="Qty" value={String(quoteItem.quantity ?? "-")} />
          <MetaRow
            label="Subtotal"
            value={`$${(quoteItem.subtotal ?? 0).toFixed(2)}`}
            strong
          />
        </div>
      )}
    </div>
  );
}

function AdditionalProductRow({
  additionalItem,
}: {
  additionalItem: AdditionalItemRequest;
}) {
  const quote = additionalItem.quote;
  const unitPrice = quote?.unitPrice ?? additionalItem.unitPrice;
  const subtotal = quote?.subtotal ?? additionalItem.subtotal;
  const hasPricing =
    typeof unitPrice === "number" && typeof subtotal === "number";

  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <div className="mb-2">
        <span className="inline-flex rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-purple-300 ring-1 ring-purple-500/20">
          Additional item
        </span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-medium text-slate-950 dark:text-white">
            {additionalItem.item.name}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Qty {additionalItem.item.quantity}
          </p>
          {additionalItem.item.url && (
            <a
              href={additionalItem.item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-purple-400 hover:text-purple-300"
            >
              View product →
            </a>
          )}
        </div>

        {hasPricing && (
          <div className="shrink-0 space-y-1.5 text-sm sm:w-44 sm:text-right">
            <MetaRow label="Unit" value={`$${(unitPrice ?? 0).toFixed(2)}`} />
            <MetaRow
              label="Qty"
              value={String(additionalItem.item.quantity)}
            />
            <MetaRow
              label="Subtotal"
              value={`$${(subtotal ?? 0).toFixed(2)}`}
              strong
            />
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-slate-500">Item progress</p>
        <AdditionalItemTracker status={additionalItem.status} />
      </div>
    </div>
  );
}

function AdditionalItemTracker({
  status,
}: {
  status: AdditionalItemRequest["status"];
}) {
  const steps = [
    { key: "pending", label: "Requested" },
    { key: "awaiting_payment", label: "Payment" },
    { key: "paid", label: "Paid" },
    { key: "purchased", label: "Purchased" },
    { key: "warehouse_received", label: "Warehouse" },
    { key: "packed", label: "Packed" },
  ];

  const statusOrder = steps.map((s) => s.key);
  const normalizedStatus =
    status === "approved" ? "awaiting_payment" : status;
  const currentIndex = statusOrder.indexOf(normalizedStatus);

  if (status === "cancelled" || status === "rejected") {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
        This additional item was {status}.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {steps.map((step, index) => {
        const completed = currentIndex > index;
        const current = currentIndex === index;

        return (
          <span
            key={step.key}
            className={`rounded-md px-2 py-1 text-[11px] font-medium ${
              completed
                ? "bg-emerald-500/10 text-emerald-400"
                : current
                  ? "bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800/80 dark:text-slate-500"
            }`}
          >
            {completed ? "✓ " : current ? "● " : ""}
            {step.label}
          </span>
        );
      })}
    </div>
  );
}

function ProductMeta({ item }: { item: RequestItem }) {
  return (
    <div className="min-w-0">
      <h3 className="text-base font-medium text-slate-950 dark:text-white">
        {item.name}
      </h3>
      <p className="mt-1 text-sm text-slate-500">Qty {item.quantity}</p>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium text-purple-400 hover:text-purple-300"
        >
          View product →
        </a>
      )}
    </div>
  );
}

function MetaRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <span className="text-slate-500 sm:hidden">{label}</span>
      <span
        className={
          strong
            ? "font-semibold text-emerald-500"
            : "font-medium text-slate-800 dark:text-slate-100"
        }
      >
        {value}
      </span>
    </div>
  );
}