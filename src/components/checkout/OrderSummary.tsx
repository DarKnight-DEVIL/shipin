"use client";

import type { Request } from "@/types/request";
import {
  Package,
  ExternalLink,
} from "lucide-react";

interface Props {
  request: Request;
}

export default function OrderSummary({
  request,
}: Props) {
  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-none">

      <div className="border-b border-slate-200 dark:border-slate-800 p-8">

        <h2 className="text-2xl font-bold">
          Items in this Order
        </h2>

        <p className="mt-2 text-slate-400">
          {request.items.length} item
          {request.items.length !== 1 && "s"}
        </p>

      </div>

      <div className="divide-y divide-slate-800">

        {request.items.map((item, index) => (

          <div
            key={index}
            className="p-8"
          >

            <div className="flex justify-between">

              <div>

                <div className="flex items-center gap-3">

                  <div className="rounded-xl bg-slate-800 p-3">

                    <Package
                      size={22}
                    />

                  </div>

                  <div>

                    <h3 className="font-semibold text-lg">
                      {item.name}
                    </h3>

                    <p className="text-sm text-slate-400">
                      Quantity: {item.quantity}
                    </p>

                  </div>

                </div>

                {item.url && (

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 text-blue-400 hover:text-blue-300"
                  >

                    View Product

                    <ExternalLink
                      size={16}
                    />

                  </a>

                )}

              </div>

              <div className="text-right">

                {item.unitPrice !== undefined && (

                  <>

                    <p className="text-sm text-slate-400">
                      Unit Price
                    </p>

                    <p className="font-semibold">
                      ${item.unitPrice.toFixed(2)}
                    </p>

                  </>

                )}

                {item.subtotal !== undefined && (

                  <>

                    <p className="mt-4 text-sm text-slate-400">
                      Subtotal
                    </p>

                    <p className="text-xl font-bold">
                      ${item.subtotal.toFixed(2)}
                    </p>

                  </>

                )}

              </div>

            </div>

          </div>

        ))}

      </div>

    </section>
  );
}