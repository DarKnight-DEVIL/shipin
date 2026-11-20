import type { Metadata } from "next";
import { INDEX_ROBOTS, canonicalUrl } from "@/config/seo";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema, webPageSchema } from "@/lib/seo/structuredData";
import Link from "next/link";

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/privacy-policy") },
  robots: INDEX_ROBOTS,
  title: "Privacy Policy",
  description:
    "Learn how ShipIN collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <JsonLd
        data={[
          webPageSchema({
            path: "/privacy-policy",
            name: "Privacy Policy",
            description:
              "How ShipIN collects, uses, shares and protects personal information for international forwarding orders.",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Privacy Policy", path: "/privacy-policy" },
          ]),
        ]}
      />
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white hover:opacity-80 mb-8"
          >
            <span className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
              ShipIN
            </span>
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
            Privacy Policy
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
            Last updated: November 1, 2026
          </p>
        </div>
      </header>

      <article className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <section id="overview" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              1. Overview
            </h2>
            <p className="mb-4">
              ShipIN (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) is
              an international shopping forwarding platform that inspects,
              packs, and forwards purchases from Indian stores to customers
              worldwide. This Privacy Policy describes what personal information
              we collect, how we use it, how we share it, and the choices you
              have regarding your data.
            </p>
          </section>

          <section id="information-collected" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              2. Information We Collect
            </h2>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              2.1 Account Information
            </h3>
            <p className="mb-4">
              When you sign in (with Google or email/password), we collect and
              store:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2">
              <li>
                <strong>Name</strong> (display name)
              </li>
              <li>
                <strong>Email address</strong>
              </li>
              <li>
                <strong>Phone number</strong> (optional, for shipment
                coordination and SMS notifications)
              </li>
              <li>
                <strong>Profile photo</strong> (from Google, if you use Google
                sign-in)
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              2.2 Shipping & Purchase Information
            </h3>
            <p className="mb-4">
              To fulfill your forwarding requests, we collect:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2">
              <li>
                <strong>Shipping address</strong> (name, address, phone, postal
                code, country)
              </li>
              <li>
                <strong>Item details</strong> for each purchase: product name,
                quantity, product URL, unit price
              </li>
              <li>
                <strong>Order numbers</strong> and{" "}
                <strong>tracking numbers</strong> from carriers
              </li>
              <li>
                <strong>Payment details</strong>: PayPal order/capture IDs,
                amounts paid, currency
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              2.3 Payment Information
            </h3>
            <p className="mb-4">
              Payments are processed by <strong>PayPal</strong>. We do not store
              your PayPal credentials. We store only the transaction identifiers
              and amounts needed to reconcile your order and issue refunds.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              2.4 Support Communications
            </h3>
            <p className="mb-4">
              Messages you send through our support system are stored so our
              team can respond.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              2.5 Authentication Security
            </h3>
            <p className="mb-4">
              For account protection, we may store multi-factor authentication
              configuration (TOTP secrets, backup codes, WebAuthn credential
              identifiers) if you enable it. Backup codes are stored hashed.
            </p>
          </section>

          <section id="how-we-use" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              3. How We Use Your Information
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Fulfill your orders</strong>: inspect, pack, and ship
                your purchases
              </li>
              <li>
                <strong>Communicate with you</strong>: order status updates,
                quotes, support replies
              </li>
              <li>
                <strong>Process payments</strong>: create and reconcile PayPal
                orders, manage refunds and wallet credits
              </li>
              <li>
                <strong>Provide support</strong>: respond to your inquiries
              </li>
              <li>
                <strong>Secure your account</strong>: enforce email
                verification, rate limiting, and MFA
              </li>
              <li>
                <strong>Improve our service</strong>: aggregated, anonymous
                analytics
              </li>
            </ul>
          </section>

          <section id="how-we-share" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              4. How We Share Your Information
            </h2>
            <p className="mb-4">
              We do <strong>not</strong> sell your personal data. We share data
              only with:
            </p>
            <div className="overflow-x-auto my-6">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Recipient
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Purpose
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Data shared
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr>
                    <td className="px-4 py-3">PayPal</td>
                    <td className="px-4 py-3">Payment processing</td>
                    <td className="px-4 py-3">Order IDs, amounts, email</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Email provider (Gmail SMTP)</td>
                    <td className="px-4 py-3">
                      Send order confirmations, verification emails
                    </td>
                    <td className="px-4 py-3">
                      Recipient email, message content
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">WhatsApp Business API</td>
                    <td className="px-4 py-3">
                      Send order status updates (opt-in)
                    </td>
                    <td className="px-4 py-3">Phone number, message content</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Vercel</td>
                    <td className="px-4 py-3">Hosting and analytics</td>
                    <td className="px-4 py-3">
                      Anonymous, aggregated usage metrics
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Carrier services</td>
                    <td className="px-4 py-3">Generate shipping labels</td>
                    <td className="px-4 py-3">
                      Recipient name, address, phone
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="legal-basis" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              5. Legal Basis for Processing
            </h2>
            <p className="mb-4">
              Where data protection law requires a legal basis (the GDPR in the
              EEA and UK, and India&apos;s Digital Personal Data Protection Act,
              2023), this is what we rely on for each purpose.
            </p>
            <div className="overflow-x-auto my-6">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Purpose
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Legal basis
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Why
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr>
                    <td className="px-4 py-3">Account and sign-in</td>
                    <td className="px-4 py-3">Contract — Art. 6(1)(b)</td>
                    <td className="px-4 py-3">
                      There is no service without an account.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Buying, inspecting, shipping</td>
                    <td className="px-4 py-3">Contract — Art. 6(1)(b)</td>
                    <td className="px-4 py-3">
                      Includes sharing the delivery address with the carrier.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Payments, refunds, invoices</td>
                    <td className="px-4 py-3">
                      Contract + legal obligation — Art. 6(1)(b), (c)
                    </td>
                    <td className="px-4 py-3">
                      Tax and accounting law requires the records.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      Fraud prevention, rate limiting, security logs
                    </td>
                    <td className="px-4 py-3">
                      Legitimate interests — Art. 6(1)(f)
                    </td>
                    <td className="px-4 py-3">
                      Keeping the platform and payments safe for everyone.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Order and status email</td>
                    <td className="px-4 py-3">Contract — Art. 6(1)(b)</td>
                    <td className="px-4 py-3">
                      You can turn the channel off from any email.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">WhatsApp status updates</td>
                    <td className="px-4 py-3">Consent — Art. 6(1)(a)</td>
                    <td className="px-4 py-3">
                      Opt-in only, timestamped, revocable in Settings.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      Error monitoring and aggregate analytics
                    </td>
                    <td className="px-4 py-3">
                      Legitimate interests — Art. 6(1)(f)
                    </td>
                    <td className="px-4 py-3">
                      Cookieless and aggregated; no advertising profile.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              We do not make automated decisions that produce legal effects about
              you, and we do not sell personal data.
            </p>
          </section>

          <section id="analytics" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              6. Analytics
            </h2>
            <p className="mb-4">
              We use <strong>Vercel Analytics</strong> and{" "}
              <strong>Vercel Speed Insights</strong> to understand how our
              service is used. These services collect anonymous, aggregated data
              such as page views, device type, and performance metrics. No
              personally identifiable information is shared with these services.
            </p>
          </section>

          <section id="cookies" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              7. Cookies
            </h2>
            <p className="mb-4">
              We do not use cookies for tracking, advertising or analytics. The
              only cookie we set is an essential{" "}
              <strong>multi-factor authentication session cookie</strong> (
              <code>shipin_admin_mfa</code>), issued only after an administrator
              completes a security-check challenge. It is set with{" "}
              <code>HttpOnly</code>, <code>Secure</code>, and{" "}
              <code>SameSite=Strict</code> flags and expires after 30 minutes.
              All other requests are authenticated with a bearer token in the
              request header, never with an ambient cookie.
            </p>
          </section>

          <section id="data-retention" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              8. Data Retention
            </h2>
            <div className="overflow-x-auto my-6">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Record
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Kept for
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr>
                    <td className="px-4 py-3">Profile and addresses</td>
                    <td className="px-4 py-3">
                      Until you delete your account, then anonymised immediately
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Orders, invoices and payment records</td>
                    <td className="px-4 py-3">8 years (tax and accounting law)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Inspection and packing photos</td>
                    <td className="px-4 py-3">24 months after delivery</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Support conversations</td>
                    <td className="px-4 py-3">24 months after the ticket closes</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Error and security logs</td>
                    <td className="px-4 py-3">90 days</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Backups</td>
                    <td className="px-4 py-3">
                      7-day point-in-time recovery, 90-day daily exports
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mb-4">
              We retain your personal data for as long as your account is active
              and as needed to fulfill your orders. Order and payment records
              are retained for legal and tax compliance purposes. You may
              request deletion of your account data at any time (see Section 10).
            </p>
          </section>

          <section id="data-security" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              9. Data Security
            </h2>
            <p className="mb-4">
              We take reasonable precautions to protect your data:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>
                All data is stored in <strong>Firebase Firestore</strong> with{" "}
                <strong>row-level security rules</strong> that restrict access
                to your own records
              </li>
              <li>
                <strong>Server-side authentication</strong> via Firebase ID
                tokens (verified, not trusted)
              </li>
              <li>
                <strong>Email verification</strong> is required before accessing
                your account
              </li>
              <li>
                <strong>Rate limiting</strong> prevents abuse
              </li>
              <li>
                <strong>Content Security Policy</strong> (CSP) blocks cross-site
                scripting
              </li>
              <li>
                <strong>No secrets are stored in logs</strong>
              </li>
              <li>
                Payment data is processed by PayPal using their PCI-compliant
                infrastructure
              </li>
            </ul>
          </section>

          <section id="your-rights" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              10. Your Rights
            </h2>
            <p className="mb-4">
              Depending on your location, you may have the right to:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Access</strong> the personal data we hold about you
              </li>
              <li>
                <strong>Correct</strong> inaccurate data
              </li>
              <li>
                <strong>Delete</strong> your account and associated data
              </li>
              <li>
                <strong>Export</strong> your data in a portable format
              </li>
              <li>
                <strong>Object</strong> to or <strong>restrict</strong> certain
                processing
              </li>
              <li>
                <strong>Withdraw consent</strong> for optional features (SMS
                notifications)
              </li>
            </ul>
            <p className="mt-4">
              To exercise any of these rights, contact us at the support email
              address in your account dashboard.
            </p>
          </section>

          <section id="children" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              11. Children
            </h2>
            <p className="mb-4">
              ShipIN is not intended for users under the age of 18. We do not
              knowingly collect data from children.
            </p>
          </section>

          <section id="changes" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              12. Changes to This Policy
            </h2>
            <p className="mb-4">
              We may update this Privacy Policy from time to time. We will
              notify you of significant changes by email or through a notice on
              our website.
            </p>
          </section>

          <section id="contact" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              13. Contact
            </h2>
            <p className="mb-4">
              For privacy-related questions, data access requests, or to report
              a concern, please use the support feature in your account
              dashboard or email us at{" "}
              <a
                href="mailto:support@shipin.co"
                className="text-orange-700 dark:text-orange-300 hover:underline"
              >
                support@shipin.co
              </a>
              .
            </p>
            <address className="not-italic text-gray-700 dark:text-gray-300 leading-relaxed">
              <strong>ShipIN</strong>
              <br />
              4th Floor, Trade Center, Andheri East
              <br />
              Mumbai 400069, India
              <br />
              Phone:{" "}
              <a
                href="tel:+912268234567"
                className="text-orange-700 dark:text-orange-300 hover:underline"
              >
                +91 22 6823 4567
              </a>
              <br />
              Hours: Mon to Sat, 09:00 to 19:00 IST
            </address>
          </section>
        </div>
      </article>

      <article className="max-w-4xl mx-auto px-4 pb-12 sm:px-6 lg:px-8">
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <section id="international-transfers" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              14. Where your data is processed
            </h2>
            <p className="mb-4">
              ShipIN is established in India and processes data there, on Google
              Cloud (Firestore) infrastructure. PayPal, Resend and Vercel process
              payment, email and hosting data in their own regions under their
              own terms. If you are in the EEA or the UK and need the transfer
              mechanism that applies to your order, and the contact details of
              any representative appointed for your jurisdiction, ask us in
              writing before you order and we will confirm what is in place.
            </p>
          </section>

          <section id="marketing" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              15. Marketing and consent
            </h2>
            <p className="mb-4">
              We do not run marketing or promotional email. Every message you
              receive is transactional: a quote, a payment receipt, a shipping
              update, a support reply, or a security notice. That is why there
              is no newsletter toggle in Settings — there is no newsletter.
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Email</strong> is on by default because it carries order
                status. Every message has a one-click unsubscribe link and
                <code>List-Unsubscribe</code> headers; unsubscribing switches the
                channel off until you turn it back on in Settings.
              </li>
              <li>
                <strong>WhatsApp</strong> updates are never on by default. They
                require an explicit opt-in, which is stored with a consent
                timestamp, and can be withdrawn at any time.
              </li>
              <li>
                If we ever introduce marketing email, it will be opt-in only and
                kept separate from transactional mail.
              </li>
            </ul>
          </section>

          <section id="sub-processors" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              16. Sub-processors and data processing agreements
            </h2>
            <p className="mb-4">
              The current sub-processor list is published in the
              <a href="/cookie-policy" className="text-orange-700 dark:text-orange-300 hover:underline">
                Cookie Policy
              </a>
              : Google Firebase, PayPal, Cloudflare, Resend, Vercel, Sentry and
              Spline. Each is engaged for a specific purpose and receives only
              the data that purpose needs.
            </p>
            <p className="mb-4">
              Each provider is used under the data processing terms it publishes
              for its service. If you need the current list, the processing terms
              on file, or a signed agreement for your own compliance file, email
              <a href="mailto:support@shipin.co" className="text-orange-700 dark:text-orange-300 hover:underline">
                support@shipin.co
              </a>
              and we will send it.
            </p>
          </section>

          <section id="breach" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              17. Personal data breaches
            </h2>
            <p className="mb-4">
              Suspected incidents are logged in an internal breach register with
              a severity, an owner and a timeline. Where a breach is likely to
              put your rights and freedoms at risk, we notify you without undue
              delay with what happened, what data was involved and what you
              should do — and, where the GDPR applies, we notify the competent
              supervisory authority within 72 hours of becoming aware of it.
            </p>
            <p>
              To report a suspected vulnerability or incident, email
              <a href="mailto:support@shipin.co" className="text-orange-700 dark:text-orange-300 hover:underline">
                support@shipin.co
              </a>
              .
            </p>
          </section>
        </div>
      </article>

      <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-16">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 text-center">
          <nav
            aria-label="Site"
            className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4"
          >
            <Link
              href="/"
              className="text-orange-700 dark:text-orange-300 hover:underline"
            >
              Home
            </Link>
            <Link
              href="/track"
              className="text-orange-700 dark:text-orange-300 hover:underline"
            >
              Track a shipment
            </Link>
            <Link
              href="/terms"
              className="text-orange-700 dark:text-orange-300 hover:underline"
            >
              Terms of Service
            </Link>
            <Link
              href="/refund-policy"
              className="text-orange-700 dark:text-orange-300 hover:underline"
            >
              Refund Policy
            </Link>
            <Link
              href="/cookie-policy"
              className="text-orange-700 dark:text-orange-300 hover:underline"
            >
              Cookie Policy
            </Link>
            <Link
              href="/licences"
              className="text-orange-700 dark:text-orange-300 hover:underline"
            >
              Licences
            </Link>
          </nav>
          <p className="text-gray-600 dark:text-gray-400">
            Questions?{" "}
            <Link
              href="/support"
              className="text-orange-700 dark:text-orange-300 hover:underline"
            >
              Contact Support
            </Link>
          </p>
        </div>
      </footer>
    </main>
  );
}
