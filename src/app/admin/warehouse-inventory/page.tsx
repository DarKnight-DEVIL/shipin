"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function WarehouseInventoryPage() {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const snapshot = await getDocs(
        collection(db, "requests")
      );

      const data = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...(doc.data() as any),
        }))
        .filter(
          (request) =>
            request.status ===
              "warehouse_received" ||
            request.status ===
              "ready_for_international_shipping" ||
            request.status ===
              "packed"
        );

      setPackages(data);
      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-white">
        Loading inventory...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-8">

      <h1 className="text-4xl font-bold text-white mb-8">
        Warehouse Inventory
      </h1>

      <div className="space-y-4">

        {packages.map((pkg) => (

          <Link
            key={pkg.id}
            href={`/admin/requests/${pkg.id}`}
          >

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-purple-500 transition">

              <div className="flex justify-between">

                <div>

                  <h2 className="text-white font-semibold">
                    Request #{pkg.id.slice(0,6)}
                  </h2>

                  <p className="text-slate-400">
                    {pkg.customerName}
                  </p>

                </div>

                <div className="text-right">

                  <p className="text-green-400">
                    {pkg.status}
                  </p>

                  <p className="text-slate-500">
                    {pkg.items.length} Items
                  </p>

                </div>

              </div>

            </div>

          </Link>

        ))}

      </div>

    </div>
  );
}