import Link from "next/link";

/**
 * Shared chrome for the legal pages.
 *
 * Every policy page needs the same header, heading level and footer links, and
 * five pages carrying their own copy is how a site ends up with a footer that
 * still links to a policy someone renamed. One component, one link list.
 */
export default function LegalDocument({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
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
            {title}
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
            Last updated: {updated}
          </p>
        </div>
      </header>

      <article className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="prose prose-lg dark:prose-invert max-w-none">
          {children}
        </div>
      </article>

      <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-16">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 text-center">
          <nav
            aria-label="Legal and site"
            className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4"
          >
            {[
              { href: "/", label: "Home" },
              { href: "/track", label: "Track a shipment" },
              { href: "/privacy-policy", label: "Privacy Policy" },
              { href: "/terms", label: "Terms of Service" },
              { href: "/refund-policy", label: "Refund Policy" },
              { href: "/cookie-policy", label: "Cookie Policy" },
              { href: "/licences", label: "Licences" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                // orange-700, not orange-600: 4.5:1 or better against white
                // for normal-size text, which orange-600 misses.
                className="text-orange-700 dark:text-orange-300 hover:underline"
              >
                {link.label}
              </Link>
            ))}
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
