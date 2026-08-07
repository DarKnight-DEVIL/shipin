"use client";

import Link from "next/link";
import {
  LifeBuoy,
  MessageCircle,
  Mail,
  ArrowRight,
  Clock3,
} from "lucide-react";

export default function HelpCard() {
  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 backdrop-blur-xl shadow-sm dark:shadow-none">

      {/* Header */}

      <div className="border-b border-slate-200 dark:border-slate-800 p-8">

        <div className="flex items-center gap-3">

          <LifeBuoy
            className="text-blue-400"
            size={26}
          />

          <div>

            <h2 className="text-2xl font-bold">
              Need Help?
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Our support team is here to help before and after your payment.
            </p>

          </div>

        </div>

      </div>

      {/* Body */}

      <div className="grid gap-5 p-8 md:grid-cols-2">

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950/60 p-8">

          <div className="flex items-center gap-3">

            <MessageCircle
              className="text-blue-400"
              size={22}
            />

            <div>

              <h3 className="font-semibold">
                Support Ticket
              </h3>

              <p className="text-sm text-slate-400">
                Create a ticket and we'll assist you.
              </p>

            </div>

          </div>

          <Link
            href="/support"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-medium hover:bg-blue-700 transition"
          >
            Open Support

            <ArrowRight size={18} />
          </Link>

        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950/60 p-8">

          <div className="flex items-center gap-3">

            <Mail
              className="text-green-400"
              size={22}
            />

            <div>

              <h3 className="font-semibold">
                Email Support
              </h3>

              <p className="text-sm text-slate-400">
                support@shipin.com
              </p>

            </div>

          </div>

          <div className="mt-5 flex items-center gap-2 text-sm text-slate-400">

            <Clock3 size={16} />

            Average response time: under 24 hours

          </div>

        </div>

      </div>

    </section>
  );
}