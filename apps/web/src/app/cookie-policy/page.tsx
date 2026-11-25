import type { Metadata } from "next";
import { INDEX_ROBOTS, canonicalUrl } from "@/config/seo";
import JsonLd from "@/components/seo/JsonLd";
import LegalDocument from "@/components/legal/LegalDocument";
import { breadcrumbSchema, webPageSchema } from "@/lib/seo/structuredData";

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/cookie-policy") },
  robots: INDEX_ROBOTS,
  title: "Cookie Policy",
  description:
    "Every cookie and browser storage key ShipIN sets, which services receive data, and how to change your choice.",
};

export default function CookiePolicyPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            path: "/cookie-policy",
            name: "Cookie Policy",
            description:
              "The cookies and browser storage ShipIN uses, the processors behind them, and how to withdraw consent.",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Cookie Policy", path: "/cookie-policy" },
          ]),
        ]}
      />
      <LegalDocument title="Cookie Policy" updated="November 20, 2026">
        <section id="summary" className="mb-12">
          <h2>1. In short</h2>
          <p>
            ShipIN sets <strong>one cookie</strong>, and only for administrators
            completing a security check. There are no advertising cookies, no
            cross-site tracking pixels, and no third-party marketing scripts. The
            analytics we use are cookieless.
          </p>
        </section>

        <section id="what-is-a-cookie" className="mb-12">
          <h2>2. What cookies and local storage are</h2>
          <p>
            A cookie is a small text file a site stores in your browser. Local
            storage and IndexedDB are similar, larger stores that stay on your
            device. This policy covers all three, because the privacy impact —
            and your control over it — is the same.
          </p>
        </section>

        <section id="cookies-we-set" className="mb-12">
          <h2>3. Cookies and storage ShipIN sets</h2>
          <div className="overflow-x-auto my-6">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Purpose / lifetime
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                  <td className="px-4 py-3">
                    <code>shipin_admin_mfa</code>
                  </td>
                  <td className="px-4 py-3">Strictly necessary cookie</td>
                  <td className="px-4 py-3">
                    Remembers that an administrator passed the second-factor
                    check. HttpOnly, Secure, SameSite=Strict, 30 minutes.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Firebase Auth (IndexedDB)</td>
                  <td className="px-4 py-3">Strictly necessary storage</td>
                  <td className="px-4 py-3">
                    Your signed-in session token, so you stay signed in between
                    pages. Cleared when you sign out.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <code>cookie-consent</code>
                  </td>
                  <td className="px-4 py-3">Preference (local storage)</td>
                  <td className="px-4 py-3">
                    Your answer in the consent banner, with the date and policy
                    version. Never sent to a server.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <code>theme</code>
                  </td>
                  <td className="px-4 py-3">Preference (local storage)</td>
                  <td className="px-4 py-3">
                    Light or dark appearance.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="analytics" className="mb-12">
          <h2>4. Analytics and error reporting</h2>
          <p>
            We use <strong>Vercel Analytics</strong> and{" "}
            <strong>Vercel Speed Insights</strong> to count page views and measure
            load performance. Both are cookieless: they do not set a cookie, do
            not build a cross-site profile, and report aggregate numbers.
          </p>
          <p>
            Because none of these use cookies or track you across other sites,
            they are not consent-gated. We still tell you they exist — the banner
            is transparency, not a permission wall in front of content.
          </p>
        </section>

        <section id="processors" className="mb-12">
          <h2>5. Services that receive your data</h2>
          <div className="overflow-x-auto my-6">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Data
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                  <td className="px-4 py-3">Google Firebase</td>
                  <td className="px-4 py-3">Database and sign-in</td>
                  <td className="px-4 py-3">Account, request and address records</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">PayPal</td>
                  <td className="px-4 py-3">Payments</td>
                  <td className="px-4 py-3">Order amount, email, transaction IDs</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Cloudflare R2</td>
                  <td className="px-4 py-3">File storage</td>
                  <td className="px-4 py-3">Inspection photos, packing photos</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Resend / Gmail SMTP</td>
                  <td className="px-4 py-3">Email delivery</td>
                  <td className="px-4 py-3">Your email address, message content</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Vercel</td>
                  <td className="px-4 py-3">Hosting and analytics</td>
                  <td className="px-4 py-3">Aggregate, cookieless usage data</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Spline</td>
                  <td className="px-4 py-3">Hero visual on the home page</td>
                  <td className="px-4 py-3">Standard request data (IP, user agent)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="choices" className="mb-12">
          <h2>6. Your choices</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              The consent banner records your choice on this device. Click{" "}
              <strong>Cookie settings</strong> in the footer to change it.
            </li>
            <li>
              Blocking the necessary cookie does not stop the site working for
              customers; it would only prevent an administrator from completing
              the security check.
            </li>
            <li>
              Your browser can delete these stores at any time. Signing out
              removes the session token as well.
            </li>
          </ul>
        </section>

        <section id="contact" className="mb-12">
          <h2>7. Contact</h2>
          <p>
            Questions about this policy:{" "}
            <a href="mailto:support@shipin.co" className="text-orange-700 dark:text-orange-300 hover:underline">
              support@shipin.co
            </a>
            . See also our{" "}
            <a href="/privacy-policy" className="text-orange-700 dark:text-orange-300 hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </section>
      </LegalDocument>
    </>
  );
}
