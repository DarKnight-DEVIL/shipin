import type { Metadata } from "next";
import { INDEX_ROBOTS, canonicalUrl } from "@/config/seo";
import JsonLd from "@/components/seo/JsonLd";
import LegalDocument from "@/components/legal/LegalDocument";
import { breadcrumbSchema, webPageSchema } from "@/lib/seo/structuredData";

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/licences") },
  robots: INDEX_ROBOTS,
  title: "Fonts, Icons and Image Licences",
  description:
    "The licence behind every font, icon set and image used on the ShipIN site, and how to report a licensing problem.",
};

export default function LicencesPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageSchema({
            path: "/licences",
            name: "Fonts, Icons and Image Licences",
            description:
              "Licensing for the typefaces, icons and imagery used on the ShipIN website.",
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Licences", path: "/licences" },
          ]),
        ]}
      />
      <LegalDocument title="Fonts, Icons and Image Licences" updated="November 20, 2026">
        <section id="fonts" className="mb-12">
          <h2>1. Typefaces</h2>
          <p>
            All fonts are self-hosted through the framework&apos;s font loader
            (no request to Google&apos;s font CDN), and all three are open source,
            so there is no per-view licence to track.
          </p>
          <div className="overflow-x-auto my-6">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Typeface
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Licence
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Used for
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                  <td className="px-4 py-3">Geist</td>
                  <td className="px-4 py-3">SIL Open Font License 1.1</td>
                  <td className="px-4 py-3">Body text across the site</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Geist Mono</td>
                  <td className="px-4 py-3">SIL Open Font License 1.1</td>
                  <td className="px-4 py-3">Tracking IDs, numbers, code</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Bricolage Grotesque</td>
                  <td className="px-4 py-3">SIL Open Font License 1.1</td>
                  <td className="px-4 py-3">Display headings</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            The SIL Open Font License allows commercial use, embedding and
            self-hosting. Font files are not resold or redistributed on their own.
          </p>
        </section>

        <section id="icons-and-ui" className="mb-12">
          <h2>2. Icons and interface libraries</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong>Lucide</strong> icons — ISC Licence, free for commercial use.
            </li>
            <li>
              <strong>Tailwind CSS</strong> and the framework itself — MIT Licence.
            </li>
            <li>
              <strong>Sonner</strong> (notifications), <strong>Framer Motion</strong>{" "}
              (animation) and the PDF libraries — MIT Licence.
            </li>
          </ul>
        </section>

        <section id="imagery" className="mb-12">
          <h2>3. Imagery and 3D</h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              The ShipIN wordmark, favicons and the social preview image were
              created for ShipIN and are our property.
            </li>
            <li>
              The home-page 3D scene is rendered by <strong>Spline</strong> under
              Spline&apos;s terms of service; the account holding the scene is
              ours.
            </li>
            <li>
              Inspection and packing photographs are uploaded by ShipIN
              operations. They remain the customer&apos;s record of their own
              goods and are never used in marketing without permission.
            </li>
            <li>
              No stock photography is used on the public site, so there is no
              per-image stock licence to expire.
            </li>
          </ul>
        </section>

        <section id="trademarks" className="mb-12">
          <h2>4. Third-party trademarks</h2>
          <p>
            PayPal, Google, Firebase, Cloudflare, Vercel and Spline are trademarks
            of their respective owners. They are named on this site to describe
            services we integrate with; no endorsement is implied.
          </p>
        </section>

        <section id="report" className="mb-12">
          <h2>5. Reporting a licensing problem</h2>
          <p>
            If you believe something on this site uses your work without
            permission, email{" "}
            <a href="mailto:support@shipin.co" className="text-orange-700 dark:text-orange-300 hover:underline">
              support@shipin.co
            </a>{" "}
            with the URL and the work in question. We remove or license the
            material first and discuss it afterwards.
          </p>
        </section>
      </LegalDocument>
    </>
  );
}
