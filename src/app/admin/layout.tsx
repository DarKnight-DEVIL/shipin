import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex">
      <aside className="w-72 bg-slate-900 border-r border-slate-800 p-6">
        <h1 className="text-3xl font-bold text-red-400 mb-10">
          ShipIN Admin
        </h1>

        <nav className="space-y-4">
          <Link
            href="/admin/dashboard"
            className="block text-slate-300 hover:text-white"
          >
            Dashboard
          </Link>

          <Link
            href="/admin/requests"
            className="block text-slate-300 hover:text-white"
          >
            Requests
          </Link>
        </nav>
      </aside>

      <section className="flex-1 p-8">
        {children}
      </section>
    </main>
  );
}