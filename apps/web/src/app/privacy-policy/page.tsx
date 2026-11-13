import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Learn how ShipIN collects, uses, and protects your personal information.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white hover:opacity-80 mb-8">
            <span className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">ShipIN</span>
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">Privacy Policy</h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">Last updated: November 1, 2026</p>
        </div>
      </header>

      <article className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <section id="overview" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">1. Overview</h2>
            <p className="mb-4">ShipIN (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) is an international shopping forwarding platform that inspects, packs, and forwards purchases from Indian stores to customers worldwide. This Privacy Policy describes what personal information we collect, how we use it, how we share it, and the choices you have regarding your data.</p>
          </section>

          <section id="information-collected" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">2. Information We Collect</h2>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2.1 Account Information</h3>
            <p className="mb-4">When you sign in (with Google or email/password), we collect and store:</p>
            <ul className="list-disc list-inside mb-4 space-y-2">
              <li><strong>Name</strong> (display name)</li>
              <li><strong>Email address</strong></li>
              <li><strong>Phone number</strong> (optional, for shipment coordination and SMS notifications)</li>
              <li><strong>Profile photo</strong> (from Google, if you use Google sign-in)</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2.2 Shipping & Purchase Information</h3>
            <p className="mb-4">To fulfill your forwarding requests, we collect:</p>
            <ul className="list-disc list-inside mb-4 space-y-2">
              <li><strong>Shipping address</strong> (name, address, phone, postal code, country)</li>
              <li><strong>Item details</strong> for each purchase: product name, quantity, product URL, unit price</li>
              <li><strong>Order numbers</strong> and <strong>tracking numbers</strong> from carriers</li>
              <li><strong>Payment details</strong>: PayPal order/capture IDs, amounts paid, currency</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2.3 Payment Information</h3>
            <p className="mb-4">Payments are processed by <strong>PayPal</strong>. We do not store your PayPal credentials. We store only the transaction identifiers and amounts needed to reconcile your order and issue refunds.</p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2.4 Support Communications</h3>
            <p className="mb-4">Messages you send through our support system are stored so our team can respond.</p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2.5 Authentication Security</h3>
            <p className="mb-4">For account protection, we may store multi-factor authentication configuration (TOTP secrets, backup codes, WebAuthn credential identifiers) if you enable it. Backup codes are stored hashed.</p>
          </section>

          <section id="how-we-use" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Fulfill your orders</strong>: inspect, pack, and ship your purchases</li>
              <li><strong>Communicate with you</strong>: order status updates, quotes, support replies</li>
              <li><strong>Process payments</strong>: create and reconcile PayPal orders, manage refunds and wallet credits</li>
              <li><strong>Provide support</strong>: respond to your inquiries</li>
              <li><strong>Secure your account</strong>: enforce email verification, rate limiting, and MFA</li>
              <li><strong>Improve our service</strong>: aggregated, anonymous analytics</li>
            </ul>
          </section>

          <section id="how-we-share" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">4. How We Share Your Information</h2>
            <p className="mb-4">We do <strong>not</strong> sell your personal data. We share data only with:</p>
            <div className="overflow-x-auto my-6">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Recipient</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Purpose</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Data shared</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr><td className="px-4 py-3">PayPal</td><td className="px-4 py-3">Payment processing</td><td className="px-4 py-3">Order IDs, amounts, email</td></tr>
                  <tr><td className="px-4 py-3">Email provider (Gmail SMTP)</td><td className="px-4 py-3">Send order confirmations, verification emails</td><td className="px-4 py-3">Recipient email, message content</td></tr>
                  <tr><td className="px-4 py-3">WhatsApp Business API</td><td className="px-4 py-3">Send order status updates (opt-in)</td><td className="px-4 py-3">Phone number, message content</td></tr>
                  <tr><td className="px-4 py-3">Vercel</td><td className="px-4 py-3">Hosting and analytics</td><td className="px-4 py-3">Anonymous, aggregated usage metrics</td></tr>
                  <tr><td className="px-4 py-3">Carrier services</td><td className="px-4 py-3">Generate shipping labels</td><td className="px-4 py-3">Recipient name, address, phone</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="analytics" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">5. Analytics</h2>
            <p className="mb-4">We use <strong>Vercel Analytics</strong> and <strong>Vercel Speed Insights</strong> to understand how our service is used. These services collect anonymous, aggregated data such as page views, device type, and performance metrics. No personally identifiable information is shared with these services.</p>
          </section>

          <section id="cookies" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">6. Cookies</h2>
            <p className="mb-4">We use a single <strong>CSRF protection cookie</strong> (<code>csrf_token</code>). It is set with <code>HttpOnly</code>, <code>Secure</code>, and <code>SameSite=Strict</code> flags. It is not used for tracking or advertising.</p>
          </section>

          <section id="data-retention" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">7. Data Retention</h2>
            <p className="mb-4">We retain your personal data for as long as your account is active and as needed to fulfill your orders. Order and payment records are retained for legal and tax compliance purposes. You may request deletion of your account data at any time (see Section 9).</p>
          </section>

          <section id="data-security" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">8. Data Security</h2>
            <p className="mb-4">We take reasonable precautions to protect your data:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>All data is stored in <strong>Firebase Firestore</strong> with <strong>row-level security rules</strong> that restrict access to your own records</li>
              <li><strong>Server-side authentication</strong> via Firebase ID tokens (verified, not trusted)</li>
              <li><strong>Email verification</strong> is required before accessing your account</li>
              <li><strong>Rate limiting</strong> prevents abuse</li>
              <li><strong>Content Security Policy</strong> (CSP) blocks cross-site scripting</li>
              <li><strong>No secrets are stored in logs</strong></li>
              <li>Payment data is processed by PayPal using their PCI-compliant infrastructure</li>
            </ul>
          </section>

          <section id="your-rights" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">9. Your Rights</h2>
            <p className="mb-4">Depending on your location, you may have the right to:</p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Access</strong> the personal data we hold about you</li>
              <li><strong>Correct</strong> inaccurate data</li>
              <li><strong>Delete</strong> your account and associated data</li>
              <li><strong>Export</strong> your data in a portable format</li>
              <li><strong>Object</strong> to or <strong>restrict</strong> certain processing</li>
              <li><strong>Withdraw consent</strong> for optional features (SMS notifications)</li>
            </ul>
            <p className="mt-4">To exercise any of these rights, contact us at the support email address in your account dashboard.</p>
          </section>

          <section id="children" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">10. Children</h2>
            <p className="mb-4">ShipIN is not intended for users under the age of 18. We do not knowingly collect data from children.</p>
          </section>

          <section id="changes" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">11. Changes to This Policy</h2>
            <p className="mb-4">We may update this Privacy Policy from time to time. We will notify you of significant changes by email or through a notice on our website.</p>
          </section>

          <section id="contact" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">12. Contact</h2>
            <p className="mb-4">For privacy-related questions, data access requests, or to report a concern, please use the support feature in your account dashboard or email us at <a href='mailto:support@shipin.co' className="text-orange-600 dark:text-orange-400 hover:underline">support@shipin.co</a>.</p>
            <address className="not-italic text-gray-700 dark:text-gray-300 leading-relaxed">
              <strong>ShipIN</strong>
              <br />
              4th Floor, Trade Center, Andheri East
              <br />
              Mumbai 400069, India
              <br />
              Phone: <a href="tel:+912268234567" className="text-orange-600 dark:text-orange-400 hover:underline">+91 22 6823 4567</a>
              <br />
              Hours: Mon to Sat, 09:00 to 19:00 IST
            </address>
          </section>
        </div>
      </article>

      <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-16">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">Questions? <Link href="/support" className="text-orange-600 dark:text-orange-400 hover:underline">Contact Support</Link></p>
        </div>
      </footer>
    </main>
  );
}