export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-white mb-8">
        Dashboard
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Open Requests</h2>
          <p className="text-4xl font-bold mt-2 text-white">0</p>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Under Review</h2>
          <p className="text-4xl font-bold mt-2 text-white">0</p>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Awaiting Payment</h2>
          <p className="text-4xl font-bold mt-2 text-white">0</p>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h2 className="text-slate-400">Shipped</h2>
          <p className="text-4xl font-bold mt-2 text-white">0</p>
        </div>
      </div>

      {/* Empty State */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
        <h2 className="text-2xl font-semibold mb-4 text-white">
          No requests yet
        </h2>

        <p className="text-slate-400 mb-8">
          Start by creating your first ShipIN request.
        </p>

        <a
          href="/requests/new"
          className="inline-block bg-purple-600 hover:bg-purple-700 px-8 py-4 rounded-xl font-semibold transition"
        >
          Create Request
        </a>
      </div>
    </div>
  );
}