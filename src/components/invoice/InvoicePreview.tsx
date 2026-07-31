"use client";

interface Props {
  invoice: any;
}

export default function InvoicePreview({
  invoice,
}: Props) {
  if (!invoice) return null;

  const originalItems =
    invoice.originalItems || [];

  const additionalPurchases =
    invoice.additionalPurchases || [];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">

      {/* =====================================
          HEADER
      ====================================== */}

      <div className="border-b border-slate-800 p-8 flex flex-col gap-6 sm:flex-row sm:justify-between sm:items-start">

        <div>

          <h1 className="text-4xl font-black tracking-tight text-white">
            Ship
            <span className="text-purple-500">
              IN
            </span>
          </h1>

          <p className="text-slate-400 mt-2">
            Global Shopping & Package
            Forwarding
          </p>

          <div className="mt-5 space-y-1 text-sm text-slate-500">

            <p>
              contact.shipin@gmail.com
            </p>

          </div>

        </div>


        <div className="sm:text-right">

          <p className="text-xs uppercase tracking-widest text-slate-500">
            Purchase Invoice
          </p>

          <h2 className="text-3xl font-bold text-white mt-2">
            INV-
            {invoice.id ??
              "Draft"}
          </h2>

          <p className="text-slate-400 mt-4">
            {new Date().toLocaleDateString()}
          </p>

        </div>

      </div>


      {/* =====================================
          CUSTOMER INFORMATION
      ====================================== */}

      <div className="grid grid-cols-1 gap-8 p-8 border-b border-slate-800 md:grid-cols-2">

        <div>

          <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">
            Bill To
          </p>

          <h3 className="text-white font-semibold">
            {invoice.customerName ??
              "Customer"}
          </h3>

          <p className="text-slate-400 mt-1">
            {invoice.email ??
              "No email provided"}
          </p>

        </div>


        <div className="md:text-right">

          <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">
            Order
          </p>

          <h3 className="text-white font-semibold break-all">
            #
            {invoice.requestId ??
              invoice.id}
          </h3>

        </div>

      </div>


      <div className="p-8">

        {/* =====================================
            ORIGINAL ORDER
        ====================================== */}

        <div>

          <div className="mb-5">

            <h3 className="text-xl font-semibold text-white">
              Original Order
            </h3>

            <p className="mt-1 text-sm text-slate-400">
              Products included in the
              original purchase request.
            </p>

          </div>


          <InvoiceItemsTable
            items={originalItems}
          />


          {/* ORIGINAL ORDER BREAKDOWN */}

          <div className="mt-8 ml-auto max-w-sm rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-3 shadow-inner">

            <Row
              title="Products"
              value={
                invoice.productsTotal
              }
            />

            <Row
              title="Domestic Shipping"
              value={
                invoice.domesticShipping
              }
            />

            <Row
              title="Estimated Shipping"
              value={
                invoice.internationalShipping
              }
            />

            <Row
              title="Service Fee"
              value={
                invoice.serviceFee
              }
            />


            <hr className="border-slate-800 my-2" />


            <div className="flex justify-between items-center text-base font-bold pt-1">

              <span className="text-white">
                Original Order Total
              </span>

              <span className="text-lg text-white">
                $
                {(
                  invoice.originalTotal ||
                  0
                ).toFixed(2)}
              </span>

            </div>

          </div>

        </div>


        {/* =====================================
            ADDITIONAL PURCHASES
        ====================================== */}

        {additionalPurchases.length >
          0 && (

          <div className="mt-12 border-t border-slate-800 pt-10">

            <div className="mb-6">

              <h3 className="text-xl font-semibold text-white">
                Additional Purchases
              </h3>

              <p className="mt-1 text-sm text-slate-400">
                Items added and paid for
                after the original order.
              </p>

            </div>


            <div className="space-y-6">

              {additionalPurchases.map(
                (
                  purchase: any,
                  index: number
                ) => (

                <div
                  key={
                    purchase.id ??
                    index
                  }
                  className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5"
                >

                  {/* PRODUCT */}

                  <div className="flex flex-col gap-5 sm:flex-row sm:justify-between">

                    <div>

                      <div className="mb-2">

                        <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-300">
                          Additional Item
                        </span>

                      </div>

                      <h4 className="mt-3 text-lg font-semibold text-white">
                        {
                          purchase.name
                        }
                      </h4>

                      <p className="mt-1 text-sm text-slate-400">
                        Quantity:{" "}
                        {
                          purchase.quantity
                        }
                      </p>

                    </div>


                    <div className="sm:text-right">

                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Product Subtotal
                      </p>

                      <p className="mt-1 text-lg font-semibold text-white">
                        $
                        {(
                          purchase.subtotal ||
                          0
                        ).toFixed(2)}
                      </p>

                    </div>

                  </div>


                  {/* ADDITIONAL QUOTE DETAILS */}

                  <div className="mt-5 rounded-xl bg-slate-950 p-4 space-y-2">

                    <Row
                      title={`Unit Price × ${purchase.quantity}`}
                      value={
                        purchase.subtotal
                      }
                    />


                    {purchase.serviceFee >
                      0 && (

                      <Row
                        title="Service Fee"
                        value={
                          purchase.serviceFee
                        }
                      />

                    )}


                    {purchase.repackingFee >
                      0 && (

                      <Row
                        title="Repacking Fee"
                        value={
                          purchase.repackingFee
                        }
                      />

                    )}


                    {purchase.storageFee >
                      0 && (

                      <Row
                        title="Storage Fee"
                        value={
                          purchase.storageFee
                        }
                      />

                    )}


                    <div className="border-t border-slate-800 pt-3 mt-3">

                      <div className="flex justify-between font-semibold">

                        <span className="text-white">
                          Amount Paid
                        </span>

                        <span className="text-green-400">
                          $
                          {(
                            purchase.totalPaid ||
                            0
                          ).toFixed(2)}
                        </span>

                      </div>

                    </div>

                  </div>

                </div>

              ))}

            </div>

          </div>

        )}


        {/* =====================================
            PAYMENT SUMMARY
        ====================================== */}

        <div className="mt-12 border-t border-slate-800 pt-10">

          <h3 className="text-xl font-semibold text-white">
            Payment Summary
          </h3>

          <div className="mt-5 ml-auto max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6 space-y-4">

            <Row
              title="Original Payment"
              value={
                invoice.originalTotal
              }
            />


            {invoice.additionalTotal >
              0 && (

              <Row
                title="Additional Payments"
                value={
                  invoice.additionalTotal
                }
              />

            )}


            <hr className="border-slate-700" />


            <div className="flex items-center justify-between">

              <span className="text-lg font-bold text-white">
                Total Paid
              </span>

              <span className="text-2xl font-bold text-green-400">
                $
                {(
                  invoice.totalPaid ||
                  0
                ).toFixed(2)}
              </span>

            </div>

          </div>

        </div>


        {/* =====================================
            NOTICE
        ====================================== */}

        <div className="mt-10 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-5">

          <h4 className="font-semibold text-yellow-400">
            Important Notice
          </h4>

          <p className="mt-3 text-sm text-slate-400 leading-7">
            The international shipping
            charge shown above is an
            estimate. The final shipping
            cost will be confirmed after
            your package reaches the ShipIN
            warehouse. If the actual
            shipping cost differs, only
            the difference will be charged
            or refunded before dispatch.
          </p>

        </div>

      </div>

    </div>
  );
}


/* =========================================
   ITEMS TABLE
========================================= */

function InvoiceItemsTable({
  items,
}: {
  items: any[];
}) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-slate-800 p-5 text-sm text-slate-400">
        No products available.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">

      <table className="w-full">

        <thead>

          <tr className="text-slate-400 border-b border-slate-800 text-sm">

            <th className="text-left pb-3 font-medium">
              Product
            </th>

            <th className="pb-3 font-medium">
              Qty
            </th>

            <th className="pb-3 font-medium">
              Unit
            </th>

            <th className="text-right pb-3 font-medium">
              Total
            </th>

          </tr>

        </thead>


        <tbody>

          {items.map(
            (
              item: any,
              index: number
            ) => (

            <tr
              key={
                item.id ??
                index
              }
              className="border-b border-slate-800 text-sm"
            >

              <td className="py-4 text-white font-medium">
                {item.name}
              </td>

              <td className="text-center text-slate-300">
                {item.quantity}
              </td>

              <td className="text-center text-slate-300">
                $
                {(
                  item.unitPrice ||
                  0
                ).toFixed(2)}
              </td>

              <td className="text-right text-white font-medium">
                $
                {(
                  item.subtotal ||
                  0
                ).toFixed(2)}
              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
}


/* =========================================
   MONEY ROW
========================================= */

function Row({
  title,
  value,
}: {
  title: string;
  value?: number;
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">

      <span className="text-slate-400">
        {title}
      </span>

      <span className="text-white font-medium">
        $
        {(value || 0).toFixed(
          2
        )}
      </span>

    </div>
  );
}