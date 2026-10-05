"use client";

import PayPalCheckout from "@/components/payment/PayPalCheckout";
import type { AdditionalItemRequest } from "@/types/request";

interface Props {
  requestId: string;
  additionalItemRequests?: AdditionalItemRequest[];
}

export default function AdditionalItemPaymentsCard({
  requestId,
  additionalItemRequests = [],
}: Props) {
  const itemsAwaitingPayment = additionalItemRequests.filter(
    (item) =>
      item.status === "awaiting_payment" &&
      typeof item.totalDue === "number" &&
      item.totalDue > 0
  );

  if (itemsAwaitingPayment.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">
          Additional item quote
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Review and pay for approved add-ons.
        </p>
      </div>

      {itemsAwaitingPayment.map((additionalRequest) => {
        const quote = additionalRequest.quote;
        const unitPrice =
          quote?.unitPrice ?? additionalRequest.unitPrice ?? 0;
        const subtotal =
          quote?.subtotal ?? additionalRequest.subtotal ?? 0;
        const serviceFee =
          quote?.serviceFee ?? additionalRequest.serviceFee ?? 0;
        const repackingFee =
          quote?.repackingFee ?? additionalRequest.repackingFee ?? 0;
        const storageFee =
          quote?.storageFee ?? additionalRequest.storageFee ?? 0;
        const totalDue =
          quote?.totalDue ?? additionalRequest.totalDue ?? 0;

        return (
          <div key={additionalRequest.id} className="shipin-surface p-5 sm:p-6">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-950 dark:text-white">
                    {additionalRequest.item.name}
                  </h3>
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400 ring-1 ring-amber-500/20">
                    Payment required
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  Qty {additionalRequest.item.quantity}
                </p>
                {additionalRequest.item.url && (
                  <a
                    href={additionalRequest.item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-block text-sm font-medium text-purple-400 hover:text-purple-300"
                  >
                    View product →
                  </a>
                )}
              </div>

              <div className="sm:text-right">
                <p className="shipin-section-label">Amount due</p>
                <p className="mt-0.5 text-2xl font-semibold text-emerald-500">
                  ${totalDue.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">
                  ${unitPrice.toFixed(2)} × {additionalRequest.item.quantity}
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  ${subtotal.toFixed(2)}
                </span>
              </div>
              {serviceFee > 0 && (
                <QuoteRow label="Service fee" value={serviceFee} />
              )}
              {repackingFee > 0 && (
                <QuoteRow label="Repacking fee" value={repackingFee} />
              )}
              {storageFee > 0 && (
                <QuoteRow label="Storage fee" value={storageFee} />
              )}
              <div className="flex justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Total
                </span>
                <span className="font-semibold text-emerald-500">
                  ${totalDue.toFixed(2)}
                </span>
              </div>
            </div>

            {repackingFee > 0 && (
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                Original parcel was packed when this item was requested. A $
                {repackingFee.toFixed(2)} repacking fee is included.
              </div>
            )}

            <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-800">
              <p className="mb-1 text-sm font-medium text-slate-900 dark:text-white">
                Complete payment
              </p>
              <p className="mb-4 text-sm text-slate-500">
                Pay securely with PayPal to add this item.
              </p>
              <div className="max-w-md">
                <PayPalCheckout
                  requestId={requestId}
                  amount={totalDue}
                  paymentType="additional_item"
                  additionalItemRequestId={additionalRequest.id}
                  onSuccess={() => {}}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuoteRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800 dark:text-slate-100">
        ${value.toFixed(2)}
      </span>
    </div>
  );
}