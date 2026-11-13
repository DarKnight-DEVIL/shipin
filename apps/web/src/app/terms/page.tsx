import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Read the Terms of Service for using ShipIN international shipping forwarding platform.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white hover:opacity-80 mb-8">
            <span className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">ShipIN</span>
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">Terms of Service</h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">Last updated: November 1, 2026</p>
        </div>
      </header>

      <article className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <section id="acceptance" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">1. Acceptance of Terms</h2>
            <p className="mb-4">By accessing or using ShipIN (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree to all of these Terms, you may not use the Service.</p>
          </section>

          <section id="what-we-do" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">2. What We Do</h2>
            <p className="mb-4">ShipIN is an international shopping forwarding platform. We inspect, pack, and forward purchases from Indian stores to customers worldwide. You submit purchase requests through our platform; we review them, provide quotes, and upon your approval procure, inspect, pack, and ship your items.</p>
          </section>

          <section id="eligibility" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">3. Eligibility</h2>
            <p className="mb-4">You must be at least 18 years old to use the Service. By using the Service, you represent and warrant that you meet this age requirement.</p>
          </section>

          <section id="accounts" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">4. Accounts</h2>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4.1 Registration</h3>
            <p className="mb-4">To use the Service, you must create an account. You may sign in with Google or with an email address and password. You are responsible for:</p>
            <ul className="list-disc list-inside mb-4 space-y-2">
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activity that occurs under your account</li>
              <li>Providing accurate and up-to-date information</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4.2 Email Verification</h3>
            <p className="mb-4">We require email verification before you can access your account. You must verify the email address you provide.</p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4.3 Account Security</h3>
            <p className="mb-4">You must not share your account, use another person&rsquo;s account, or attempt to access another user&rsquo;s account. Notify us immediately of any unauthorized use of your account.</p>
          </section>

          <section id="purchase-requests" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">5. Purchase Requests and Quotes</h2>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5.1 Submitting Requests</h3>
            <p className="mb-4">You may submit purchase requests for items available from Indian stores. You represent that you have the right to purchase the items you request.</p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5.2 Quotes</h3>
            <p className="mb-4">We provide quotes based on the information you submit. Quotes are estimates and are subject to change based on actual procurement costs, shipping rates, and fees. Quotes expire on the date indicated.</p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5.3 Approval</h3>
            <p className="mb-4">Nothing is charged until you approve a quote. By approving a quote, you authorize us to procure the items and charge the agreed amount.</p>
          </section>

          <section id="fees" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">6. Fees and Payments</h2>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6.1 Pricing</h3>
            <p className="mb-4">Our fees include: product costs, domestic shipping, international shipping, service fees, inspection fees, and any applicable taxes. We will provide a detailed breakdown before you approve any quote.</p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6.2 Payment Methods</h3>
            <p className="mb-4">We accept PayPal and wallet credits. We do not store your payment credentials.</p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6.3 Refunds</h3>
            <p className="mb-4">Refunds are processed according to our refund policy, available in your account dashboard. Refund requests are reviewed on a case-by-case basis.</p>
          </section>

          <section id="shipping" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">7. Shipping and Delivery</h2>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">7.1 Transit Times</h3>
            <p className="mb-4">Transit times are estimates provided by carriers and are not guaranteed. We are not liable for delays caused by carriers, customs, or events beyond our control.</p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">7.2 Customs and Duties</h3>
            <p className="mb-4">You are responsible for all customs duties, taxes, and import fees in the destination country. We do not pay or collect these on your behalf.</p>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">7.3 Restricted Items</h3>
            <p className="mb-4">You must not use the Service to ship prohibited, illegal, or restricted items. We reserve the right to refuse or cancel any request.</p>
          </section>

          <section id="conduct" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">8. User Conduct</h2>
            <p className="mb-4">You agree not to use the Service to:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Violate any applicable law or regulation</li>
              <li>Infringe the intellectual property rights of others</li>
              <li>Transmit spam, malware, or harmful content</li>
              <li>Attempt to gain unauthorized access to the Service or its systems</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
              <li>Impersonate another person or entity</li>
              <li>Engage in fraudulent or deceptive activity</li>
            </ul>
          </section>

          <section id="ip" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">9. Intellectual Property</h2>
            <p className="mb-4">The Service, including all content, software, design, and branding, is owned by ShipIN and protected by intellectual property laws. You retain ownership of the information you submit, but grant us a license to use it to fulfill your requests and operate the Service.</p>
          </section>

          <section id="disclaimers" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">10. Disclaimers</h2>
            <p className="mb-4">The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, express or implied. We do not warrant that the Service will be uninterrupted, error-free, or secure.</p>
          </section>

          <section id="liability" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">11. Limitation of Liability</h2>
            <p className="mb-4">To the fullest extent permitted by law, ShipIN shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Service. Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim.</p>
          </section>

          <section id="termination" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">12. Termination</h2>
            <p className="mb-4">We may terminate or suspend your account at any time, with or without cause, including for violation of these Terms. Upon termination, your right to use the Service ceases immediately.</p>
          </section>

          <section id="changes" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">13. Changes to These Terms</h2>
            <p className="mb-4">We may update these Terms from time to time. We will notify you of significant changes by email or through a notice on our website. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
          </section>

          <section id="governing-law" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">14. Governing Law</h2>
            <p className="mb-4">These Terms are governed by the laws of India. Any disputes shall be resolved in the courts of Mumbai, India.</p>
          </section>

          <section id="contact" className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">15. Contact</h2>
            <p className="mb-4">For questions about these Terms, please use the support feature in your account dashboard or email us at <a href="mailto:support@shipin.co" className="text-orange-600 dark:text-orange-400 hover:underline">support@shipin.co</a>.</p>
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