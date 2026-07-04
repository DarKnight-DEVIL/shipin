export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Navbar */}
      <nav className="flex justify-between items-center px-8 py-6 border-b border-slate-800">
        <h1 className="text-3xl font-bold text-purple-400">ShipIN</h1>

        <div className="space-x-6">
          <button className="text-slate-300 hover:text-white transition">
            Login
          </button>

          <button className="bg-purple-600 hover:bg-purple-700 px-5 py-2 rounded-lg transition">
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col justify-center items-center text-center px-6">
        <h2 className="text-6xl font-bold mb-6">
          Anything from India,
          <br />
          delivered worldwide.
        </h2>

        <p className="text-xl text-slate-400 max-w-2xl mb-10">
          Your trusted sourcing, shopping and forwarding partner in India.
        </p>

        <div className="flex gap-4">
          <button className="bg-purple-600 hover:bg-purple-700 px-8 py-4 rounded-xl text-lg font-semibold transition">
            Create Request
          </button>

          <button className="border border-slate-700 hover:border-purple-500 px-8 py-4 rounded-xl text-lg transition">
            Learn More
          </button>
        </div>
      </section>
    </main>
  );
}