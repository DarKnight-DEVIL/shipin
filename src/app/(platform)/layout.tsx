import Link from "next/link";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 p-6 hidden md:flex flex-col">
        <h1 className="text-3xl font-bold text-purple-400 mb-10">
          ShipIN
        </h1>

        <nav className="space-y-4 flex-1">
          <Link
            href="/dashboard"
            className="block text-slate-300 hover:text-white transition"
          >
            Dashboard
          </Link>

          <Link
            href="/requests/new"
            className="block text-slate-300 hover:text-white transition"
          >
            New Request
          </Link>

          <Link
            href="/addresses"
            className="block text-slate-300 hover:text-white transition"
          >
            Addresses
          </Link>

          <Link
            href="/support"
            className="block text-slate-300 hover:text-white transition"
          >
            Support
          </Link>

          <Link
            href="/settings"
            className="block text-slate-300 hover:text-white transition"
          >
            Settings
          </Link>
        </nav>

        <button className="text-red-400 hover:text-red-300 pt-8 text-left">
          Logout
        </button>
      </aside>

      {/* Main Content */}
      <section className="flex-1 overflow-y-auto">
        {children}
      </section>
    </main>
  );
}