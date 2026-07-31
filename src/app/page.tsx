"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setLoggedIn(!!user);
    });

    return unsubscribe;
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Navbar */}
      <nav className="flex justify-between items-center px-8 py-6 border-b border-slate-800">
        <Link
          href="/"
          className="text-3xl font-bold text-purple-400"
        >
          ShipIN
        </Link>

        <div className="flex items-center gap-6">
          <a
            href="#how-it-works"
            className="text-slate-300 hover:text-white transition"
          >
            How It Works
          </a>

          {loggedIn ? (
            <Link
              href="/dashboard"
              className="text-slate-300 hover:text-white transition"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-slate-300 hover:text-white transition"
            >
              Login
            </Link>
          )}

          <Link
            href={
              loggedIn
                ? "/requests/new"
                : "/login?next=/requests/new"
            }
            className="bg-purple-600 hover:bg-purple-700 px-5 py-2 rounded-lg transition"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-[calc(100vh-89px)] flex flex-col justify-center items-center text-center px-6">
        <div className="mb-5 rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-2 text-sm text-purple-300">
          Shop India from anywhere
        </div>

        <h1 className="text-5xl md:text-6xl font-bold mb-6">
          Anything from India,
          <br />
          <span className="text-purple-400">
            delivered worldwide.
          </span>
        </h1>

        <p className="text-xl text-slate-400 max-w-2xl mb-10">
          Your trusted sourcing, shopping
          and package forwarding partner
          in India.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href={
              loggedIn
                ? "/requests/new"
                : "/login?next=/requests/new"
            }
            className="bg-purple-600 hover:bg-purple-700 px-8 py-4 rounded-xl text-lg font-semibold transition"
          >
            Create Request
          </Link>

          <a
            href="#how-it-works"
            className="border border-slate-700 hover:border-purple-500 px-8 py-4 rounded-xl text-lg transition"
          >
            Learn More
          </a>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="border-t border-slate-800 px-6 py-24"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-purple-400 font-semibold mb-3">
              HOW IT WORKS
            </p>

            <h2 className="text-4xl font-bold">
              Shopping from India made simple
            </h2>

            <p className="text-slate-400 mt-4 max-w-2xl mx-auto">
              Send us the product you want.
              ShipIN handles purchasing,
              receiving and international
              forwarding.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <Step
              number="01"
              title="Submit Request"
              description="Send us the product link and quantity you want to purchase."
            />

            <Step
              number="02"
              title="Receive Quote"
              description="We review your request and provide the purchase cost and applicable fees."
            />

            <Step
              number="03"
              title="Warehouse"
              description="We purchase your products and receive them at the ShipIN warehouse."
            />

            <Step
              number="04"
              title="Worldwide Delivery"
              description="Your package is prepared and forwarded to your international address."
            />
          </div>

          <div className="text-center mt-12">
            <Link
              href={
                loggedIn
                  ? "/requests/new"
                  : "/login?next=/requests/new"
              }
              className="inline-block bg-purple-600 hover:bg-purple-700 px-7 py-3 rounded-xl font-semibold transition"
            >
              Start Your First Request
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="text-purple-400 text-sm font-bold mb-5">
        {number}
      </div>

      <h3 className="text-xl font-semibold mb-3">
        {title}
      </h3>

      <p className="text-slate-400 leading-6">
        {description}
      </p>
    </div>
  );
}