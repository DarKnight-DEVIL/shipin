"use client";

import { ArrowLeft, ShoppingCart } from "lucide-react";
import Link from "next/link";

interface Props {
  requestId: string;
  status: string;
}

export default function CheckoutHeader({
  requestId,
  status,
}: Props) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">

      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white">

        <Link
          href={`/requests/${requestId}`}
          className="mb-6 inline-flex items-center gap-2 text-blue-100 hover:text-white transition"
        >
          <ArrowLeft size={18} />
          Back to Request
        </Link>

        <div className="flex items-center gap-4">

          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">

            <ShoppingCart size={30} />

          </div>

          <div>

            <h1 className="text-4xl font-bold">
              Checkout
            </h1>

            <p className="mt-2 text-blue-100">
              Review your quotation and complete payment securely.
            </p>

          </div>

        </div>

      </div>

      <div className="flex items-center justify-between px-8 py-5">

        <div>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Request ID
          </p>

          <p className="font-semibold text-slate-900 dark:text-white">
            #{requestId}
          </p>

        </div>

        <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">

          {status.replaceAll("_", " ")}

        </span>

      </div>

    </section>
  );
}