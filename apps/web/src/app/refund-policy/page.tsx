import type { Metadata } from "next";
import { INDEX_ROBOTS, canonicalUrl } from "@/config/seo";
import JsonLd from "@/components/seo/JsonLd";
import LegalDocument from "@/components/legal/LegalDocument";
import { breadcrumbSchema, webPageSchema } from "@/lib/seo/structuredData";

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/refund-policy") },
  robots: INDEX_ROBOTS,
  title: "Refund & Cancellation Policy",
  description:
    "When ShipIN refunds a request, how cancellations work before and after procurement, and how damaged or missing items are resolved.",
};

export default function RefundPolicyPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            path: "/refund-policy",
            name: "Refund & Cancellation Policy",
            description:
              "Cancellation windows, refund methods and the damaged-item process for ShipIN forwarding requests.",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Refund & Cancellation Policy", path: "/refund-policy" },
          ]),
        ]}
      />
      <LegalDocument
        title="Refund & Cancellation Policy"
        updated="November 24, 2026"
      >
        <section id="summary" className="mb-12">
          <h2>1. In short</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              Cancel before we buy: refunded in full, including the service fee.
            </li>
            <li>
              Cancel after we buy: we resell or return what we can and refund
              the balance.
            </li>
            <li>
              Wrong, damaged or missing: photographed at the hub, then refunded
              or replaced.
            </li>
            <li>
              No restocking fee, no cancellation penalty, no fee to open a
              claim.
            </li>
          </ul>
        </section>

        <section id="cancellation" className="mb-12">
          <h2>2. Cancelling a request</h2>
          <h3>2.1 Before procurement starts</h3>
          <p>
            A request is not charged until you approve its quote. While the
            request is still in <em>quote pending</em> or{" "}
            <em>quote approved, not yet purchased</em>, you can cancel from the
            request page and everything you paid is refunded — the full quoted
            amount, including the service fee and any add-ons you selected.
          </p>
          <h3>2.2 After procurement starts</h3>
          <p>
            Once we have paid the seller the request cannot be cancelled
            outright. We will ask the seller for a return where their policy
            allows it, and we resell or return the items on your behalf. You
            receive the proceeds, less any seller restocking charge and the
            domestic shipping already spent. We tell you the exact figure before
            we act on it; nothing further is deducted silently.
          </p>
          <h3>2.3 Service fee</h3>
          <p>
            The service fee is calculated from the value of the products in your
            quote and is part of the quoted amount, so it is refunded with it
            under 2.1. The same applies to the optional add-ons — detailed
            inspection and hold. Nothing recurring is charged.
          </p>
        </section>

        <section id="problems" className="mb-12">
          <h2>3. Wrong, damaged or missing items</h2>
          <p>
            Every parcel is inspected at the Mumbai hub and photographed before
            consolidation, so a mismatch is usually caught before international
            dispatch. If something still goes wrong:
          </p>
          <ul className="list-disc list-inside space-y-2">
            <li>
              Open a support ticket from the request within{" "}
              <strong>7 days</strong> of delivery, with photos of the item and
              the packaging.
            </li>
            <li>
              We compare your photos with the hub inspection record and the
              seller invoice.
            </li>
            <li>
              Resolution is a replacement sourced at the same price, a partial
              refund for a damaged item, or a full refund where the item cannot
              be used and cannot be replaced.
            </li>
          </ul>
          <p>
            Where a carrier caused the damage, we file the carrier claim
            ourselves. You do not have to deal with the carrier.
          </p>
        </section>

        <section id="how-refunds-are-paid" className="mb-12">
          <h2>4. How refunds are paid</h2>
          <div className="overflow-x-auto my-6">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Timing
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                  <td className="px-4 py-3">Wallet credit</td>
                  <td className="px-4 py-3">Immediately, once approved</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    PayPal (original payment method)
                  </td>
                  <td className="px-4 py-3">
                    5–10 business days, as processed by PayPal
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            You choose the method when the refund is agreed. A refund to PayPal
            can only go to the account that paid for the request; a wallet
            credit is always available and can be used on any future request.
          </p>
        </section>

        <section id="not-refundable" className="mb-12">
          <h2>5. What is not refundable</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>International freight once the parcel has left the hub.</li>
            <li>
              Duties and taxes already paid to a customs authority — these are
              collected by the government, not by ShipIN.
            </li>
            <li>
              Items seized or destroyed by customs because the goods are
              prohibited, restricted, or were described incorrectly by the
              customer.
            </li>
            <li>
              Storage beyond the free period, where the customer asked us to
              hold the parcel.
            </li>
          </ul>
        </section>

        <section id="chargebacks" className="mb-12">
          <h2>6. Before you open a chargeback</h2>
          <p>
            Contact support first. A chargeback freezes the request while the
            payment provider investigates, which usually delays the outcome you
            want. We resolve the overwhelming majority of claims directly, and
            we answer every claim in writing.
          </p>
        </section>

        <section id="your-rights" className="mb-12">
          <h2>7. Your statutory rights</h2>
          <p>
            Nothing in this policy limits rights you have under the Indian
            Consumer Protection Act, 2019 or the consumer law of your own
            country. If our decision is wrong, you can escalate it to your local
            consumer forum.
          </p>
        </section>

        <section id="contact" className="mb-12">
          <h2>8. Contact</h2>
          <p>
            Open a support ticket from the request itself — it carries the
            request ID and inspection photos — or email{" "}
            <a
              href="mailto:support@shipin.co"
              className="text-orange-700 underline underline-offset-2 decoration-orange-700/50 hover:decoration-orange-700 dark:text-orange-300 dark:decoration-orange-300/50 dark:hover:decoration-orange-300"
            >
              support@shipin.co
            </a>
            . We answer refund questions within one business day.
          </p>
        </section>
      </LegalDocument>
    </>
  );
}
