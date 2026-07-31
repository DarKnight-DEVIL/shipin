"use client";

import PayPalCheckout from "@/components/payment/PayPalCheckout";

import type {
  AdditionalItemRequest,
} from "@/types/request";

interface Props {
  requestId: string;
  additionalItemRequests?: AdditionalItemRequest[];
}

export default function AdditionalItemPaymentsCard({
  requestId,
  additionalItemRequests = [],
}: Props) {
  /*
   * Only show approved additional items
   * that are currently waiting for payment.
   */
  const itemsAwaitingPayment =
    additionalItemRequests.filter(
      (item) =>
        item.status ===
          "awaiting_payment" &&
        typeof item.totalDue ===
          "number" &&
        item.totalDue > 0
    );

  /*
   * Hide the entire section when
   * there is nothing left to pay.
   */
  if (
    itemsAwaitingPayment.length === 0
  ) {
    return null;
  }

  return (
    <div className="space-y-6">

      {/* SECTION HEADER */}

      <div>
        <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
          Additional Item Quote
        </h2>

        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Review and pay for your approved
          additional item requests.
        </p>
      </div>


      {/* ADDITIONAL QUOTES */}

      {itemsAwaitingPayment.map(
        (additionalRequest) => {

          /*
           * Prefer the new supplementary
           * quote structure.
           *
           * Fall back to the old top-level
           * fields for older requests.
           */

          const quote =
            additionalRequest.quote;

          const unitPrice =
            quote?.unitPrice ??
            additionalRequest.unitPrice ??
            0;

          const subtotal =
            quote?.subtotal ??
            additionalRequest.subtotal ??
            0;

          const serviceFee =
            quote?.serviceFee ??
            additionalRequest.serviceFee ??
            0;

          const repackingFee =
            quote?.repackingFee ??
            additionalRequest.repackingFee ??
            0;

          const storageFee =
            quote?.storageFee ??
            additionalRequest.storageFee ??
            0;

          const totalDue =
            quote?.totalDue ??
            additionalRequest.totalDue ??
            0;

          return (
            <div
              key={
                additionalRequest.id
              }
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
            >

              {/* QUOTE HEADER */}

              <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">

                <div>

                  <div className="mb-2 flex items-center gap-3">

                    <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                      {
                        additionalRequest
                          .item.name
                      }
                    </h3>

                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      Payment Required
                    </span>

                  </div>

                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Quantity:{" "}
                    {
                      additionalRequest
                        .item.quantity
                    }
                  </p>

                  {additionalRequest.item
                    .url && (

                    <a
                      href={
                        additionalRequest
                          .item.url
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block break-all text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                    >
                      View Product
                    </a>

                  )}

                </div>


                {/* TOTAL */}

                <div className="text-left sm:text-right">

                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Amount Due
                  </p>

                  <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
                    $
                    {totalDue.toFixed(
                      2
                    )}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    USD
                  </p>

                </div>

              </div>


              {/* PRODUCT PRICE */}

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800">

                <div className="flex items-center justify-between">

                  <div>

                    <p className="font-medium text-slate-950 dark:text-white">
                      Product Price
                    </p>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      $
                      {unitPrice.toFixed(
                        2
                      )}{" "}
                      ×{" "}
                      {
                        additionalRequest
                          .item.quantity
                      }
                    </p>

                  </div>

                  <p className="text-lg font-semibold text-slate-950 dark:text-white">
                    $
                    {subtotal.toFixed(
                      2
                    )}
                  </p>

                </div>

              </div>


              {/* QUOTE BREAKDOWN */}

              <div className="mt-5 space-y-3">

                <QuoteRow
                  label="Product Subtotal"
                  value={subtotal}
                />


                {serviceFee > 0 && (

                  <QuoteRow
                    label="Service Fee"
                    value={
                      serviceFee
                    }
                  />

                )}


                {repackingFee > 0 && (

                  <QuoteRow
                    label="Repacking Fee"
                    value={
                      repackingFee
                    }
                  />

                )}


                {storageFee > 0 && (

                  <QuoteRow
                    label="Storage Fee"
                    value={
                      storageFee
                    }
                  />

                )}


                <div className="border-t border-slate-200 pt-4 dark:border-slate-700">

                  <div className="flex items-center justify-between">

                    <span className="text-lg font-semibold text-slate-950 dark:text-white">
                      Additional Quote Total
                    </span>

                    <span className="text-xl font-bold text-green-600 dark:text-green-400">
                      $
                      {totalDue.toFixed(
                        2
                      )}
                    </span>

                  </div>

                </div>

              </div>


              {/* REPACKING NOTICE */}

              {repackingFee > 0 && (

                <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">

                  <p className="text-sm leading-6 text-amber-800 dark:text-amber-300">
                    Your original parcel was
                    already packed when this
                    item was requested. A $
                    {repackingFee.toFixed(
                      2
                    )}{" "}
                    repacking fee has been
                    included.
                  </p>

                </div>

              )}


              {/* PAYPAL */}

              <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">

                <div className="mb-4">

                  <h4 className="font-semibold text-slate-950 dark:text-white">
                    Complete Payment
                  </h4>

                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Pay securely with PayPal
                    to add this item to your
                    order.
                  </p>

                </div>


                <div className="max-w-md">

                  <PayPalCheckout
                    requestId={
                      requestId
                    }
                    amount={
                      totalDue
                    }
                    paymentType="additional_item"
                    additionalItemRequestId={
                      additionalRequest.id
                    }

                    /*
                     * Do NOT reload.
                     *
                     * The request details
                     * page already uses
                     * Firestore onSnapshot.
                     *
                     * After PayPal updates
                     * Firestore, this
                     * component receives
                     * the new request data
                     * automatically.
                     */
                    onSuccess={() => {}}
                  />

                </div>

              </div>

            </div>
          );
        }
      )}

    </div>
  );
}


/* =========================================
   QUOTE ROW
========================================= */

function QuoteRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">

      <span className="text-sm text-slate-600 dark:text-slate-400">
        {label}
      </span>

      <span className="font-medium text-slate-950 dark:text-white">
        ${value.toFixed(2)}
      </span>

    </div>
  );
}