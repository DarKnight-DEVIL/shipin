"use client";

import type { Request } from "@/types/request";

interface Props {
  request: Request;
  compact?: boolean;
}

export default function QuoteCard({ request, compact = false}: Props) {
  const quote = request.quote;

  if (!quote) return null;

  /*
   * Additional items that have completed payment.
   * We continue showing them as they move through
   * purchased -> warehouse -> packed.
   */
  const paidAdditionalItems =
    (
      request.additionalItemRequests ||
      []
    ).filter(
      (item) =>
        item.status === "paid" ||
        item.status === "purchased" ||
        item.status ===
          "warehouse_received" ||
        item.status === "packed"
    );

  /*
   * Original order total.
   *
   * Prefer the actual payment amount once paid.
   * Otherwise use the original quote total.
   */
  const originalTotal =
    request.payment?.amount ??
    quote.breakdown?.grandTotal ??
    0;

  /*
   * Total amount paid for all additional items.
   */
  const additionalTotal =
    paidAdditionalItems.reduce(
      (total, item) => {
        return (
          total +
          (item.amountPaid ??
            item.totalDue ??
            0)
        );
      },
      0
    );

  const totalPaid =
    originalTotal +
    additionalTotal;

  return (
    <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

      <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">
        Purchase Invoice
      </h2>

      {/* ============================
          ORIGINAL ORDER
      ============================= */}

      <div className="mt-6">

        {paidAdditionalItems.length >
          0 && (
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
              Original Order
            </h3>
          </div>
        )}

        <div className="space-y-4">

          <Row
            label="Products Total"
            value={
              quote.breakdown
                ?.productsTotal
            }
          />

          <Row
            label="Domestic Shipping"
            value={
              quote.breakdown
                ?.domesticShipping
            }
          />

          <Row
            label="Estimated International Shipping"
            value={
              quote.breakdown
                ?.internationalShipping
            }
          />

          <Row
            label="ShipIN Service Fee"
            value={
              quote.breakdown
                ?.serviceFee
            }
          />

          <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-700">

            <div className="flex justify-between items-center">

              <span className="text-lg font-bold text-slate-950 dark:text-white">
                {request.payment
                  ? "Original Total"
                  : "Estimated Total"}
              </span>

              <span className="text-xl font-bold text-green-600 dark:text-green-400">
                $
                {originalTotal.toFixed(
                  2
                )}
              </span>

            </div>

          </div>

        </div>

      </div>


      {/* ============================
          ADDITIONAL PURCHASES
      ============================= */}

      {paidAdditionalItems.length >
        0 && (

        <div className="mt-8 border-t border-slate-200 pt-7 dark:border-slate-700">

          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
            Additional Purchases
          </h3>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Items added after your
            original order.
          </p>


          <div className="mt-5 space-y-4">

            {paidAdditionalItems.map(
              (additionalItem) => {

                const item =
                  additionalItem.item;

                const unitPrice =
                  additionalItem
                    .unitPrice ??
                  0;

                const subtotal =
                  additionalItem
                    .subtotal ??
                  unitPrice *
                    item.quantity;

                const serviceFee =
                  additionalItem
                    .serviceFee ??
                  0;

                const repackingFee =
                  additionalItem
                    .repackingFee ??
                  0;

                const storageFee =
                  additionalItem
                    .storageFee ??
                  0;

                const amountPaid =
                  additionalItem
                    .amountPaid ??
                  additionalItem
                    .totalDue ??
                  0;

                return (
                  <div
                    key={
                      additionalItem.id
                    }
                    className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5"
                  >

                    <div className="flex items-start justify-between gap-4">

                      <div>

                        <span className="inline-block rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-700 dark:text-purple-300">
                          Additional Item
                        </span>

                        <h4 className="mt-3 font-semibold text-slate-950 dark:text-white">
                          {item.name}
                        </h4>

                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          Quantity:{" "}
                          {
                            item.quantity
                          }
                        </p>

                      </div>

                      <div className="text-right">

                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Subtotal
                        </p>

                        <p className="mt-1 font-semibold text-slate-950 dark:text-white">
                          $
                          {subtotal.toFixed(
                            2
                          )}
                        </p>

                      </div>

                    </div>


                    <div className="mt-5 border-t border-slate-200 dark:border-slate-700/50 pt-4 space-y-3">

                      <Row
                        label={`Unit Price × ${item.quantity}`}
                        value={
                          subtotal
                        }
                      />


                      {serviceFee >
                        0 && (

                        <Row
                          label="Service Fee"
                          value={
                            serviceFee
                          }
                        />

                      )}


                      {repackingFee >
                        0 && (

                        <Row
                          label="Repacking Fee"
                          value={
                            repackingFee
                          }
                        />

                      )}


                      {storageFee >
                        0 && (

                        <Row
                          label="Storage Fee"
                          value={
                            storageFee
                          }
                        />

                      )}


                      <div className="border-t border-slate-200 dark:border-slate-700/50 pt-3">

                        <div className="flex justify-between">

                          <span className="font-semibold text-slate-950 dark:text-white">
                            Amount Paid
                          </span>

                          <span className="font-bold text-green-600 dark:text-green-400">
                            $
                            {amountPaid.toFixed(
                              2
                            )}
                          </span>

                        </div>

                      </div>

                    </div>

                  </div>
                );
              }
            )}

          </div>

        </div>

      )}


      {/* ============================
          PAYMENT SUMMARY
      ============================= */}

      {paidAdditionalItems.length >
        0 && (

        <div className="mt-8 border-t border-slate-200 pt-7 dark:border-slate-700">

          <h3 className="mb-5 text-lg font-semibold text-slate-950 dark:text-white">
            Payment Summary
          </h3>

          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">

            <Row
              label="Original Payment"
              value={
                originalTotal
              }
            />

            <Row
              label="Additional Payments"
              value={
                additionalTotal
              }
            />

            <div className="border-t border-slate-200 pt-4 dark:border-slate-700">

              <div className="flex justify-between items-center">

                <span className="text-xl font-bold text-slate-950 dark:text-white">
                  Total Paid
                </span>

                <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                  $
                  {totalPaid.toFixed(
                    2
                  )}
                </span>

              </div>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}


function Row({
  label,
  value,
}: {
  label: string;
  value?: number;
}) {
  return (
    <div className="flex justify-between gap-4">

      <span className="text-slate-600 dark:text-slate-400">
        {label}
      </span>

      <span className="font-semibold text-slate-950 dark:text-white">
        $
        {(value ?? 0).toFixed(
          2
        )}
      </span>

    </div>
  );
}