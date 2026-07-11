"use client";

interface Props {
  invoice: any;
}

export default function InvoicePreview({ invoice }: Props) {
  if (!invoice) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
      
      {/* Redesigned Header Area */}
      <div className="border-b border-slate-800 p-8 flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white">
            Ship<span className="text-purple-500">IN</span>
          </h1>
          <p className="text-slate-400 mt-2">
            Global Shopping & Package Forwarding
          </p>
          <div className="mt-5 space-y-1 text-sm text-slate-500">
            <p>support@shipin.in</p>
            <p>www.shipin.in</p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Purchase Invoice
          </p>
          <h2 className="text-3xl font-bold text-white mt-2">
            INV-{invoice.id ?? "Draft"}
          </h2>
          <p className="text-slate-400 mt-4">
            {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Customer Information Section */}
      <div className="grid grid-cols-2 gap-10 p-8 border-b border-slate-800">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">
            Bill To
          </p>
          <h3 className="text-white font-semibold">
            {invoice.customerName ?? "Customer"}
          </h3>
          <p className="text-slate-400 mt-1">
            {invoice.email ?? "No email provided"}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">
            Order
          </p>
          <h3 className="text-white font-semibold">
            #{invoice.requestId ?? invoice.id}
          </h3>
        </div>
      </div>

      {/* Products Table Wrapper */}
      <div className="p-8">
        <table className="w-full">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800 text-sm">
              <th className="text-left pb-3 font-medium">Product</th>
              <th className="pb-3 font-medium">Qty</th>
              <th className="pb-3 font-medium">Unit</th>
              <th className="text-right pb-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items?.map((item: any, index: number) => (
              <tr
                key={index}
                className="border-b border-slate-800 text-sm"
              >
                <td className="py-4 text-white font-medium">
                  {item.name}
                </td>
                <td className="text-center text-slate-300">
                  {item.quantity}
                </td>
                <td className="text-center text-slate-300">
                  ${(item.unitPrice || 0).toFixed(2)}
                </td>
                <td className="text-right text-white font-medium">
                  ${(item.subtotal || 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Stripe-Style Totals Card */}
        <div className="mt-8 ml-auto max-w-sm rounded-xl border border-slate-800 bg-slate-950 p-5 space-y-3 shadow-inner">
          <Row
            title="Products"
            value={invoice.productsTotal}
          />
          <Row
            title="Domestic Shipping"
            value={invoice.domesticShipping}
          />
          <Row
            title="Estimated Shipping"
            value={invoice.internationalShipping}
          />
          <Row
            title="Service Fee"
            value={invoice.serviceFee}
          />

          <hr className="border-slate-800 my-2" />

          <div className="flex justify-between items-center text-base font-bold pt-1">
            <span className="text-white">
              Estimated Total
            </span>
            <span className="text-xl text-green-400">
              ${(invoice.grandTotal || 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Revised Notice Footer */}
        <div className="mt-10 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-5">
          <h4 className="font-semibold text-yellow-400">
            Important Notice
          </h4>
          <p className="mt-3 text-sm text-slate-400 leading-7">
            The international shipping charge shown above is an estimate.
            The final shipping cost will be confirmed after your package
            reaches the ShipIN warehouse. If the actual shipping cost differs,
            only the difference will be charged or refunded before dispatch.
          </p>
        </div>

      </div>
    </div>
  );
}

function Row({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-400">
        {title}
      </span>
      <span className="text-white font-medium">
        ${(value || 0).toFixed(2)}
      </span>
    </div>
  );
}