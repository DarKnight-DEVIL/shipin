"use client";

import { useState } from "react";

export default function NewRequestPage() {
  const [items, setItems] = useState([
    {
      name: "",
      url: "",
      quantity: 1,
    },
  ]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-4xl font-bold mb-2 text-white">
        Create Request
      </h1>

      <p className="text-slate-400 mb-8">
        Submit products you'd like ShipIN to purchase and forward to you.
      </p>

      {/* Items */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-6">
          Items
        </h2>

        {items.map((item, index) => (
          <div
            key={index}
            className="border border-slate-800 rounded-xl p-4 mb-4"
          >
            <h3 className="font-semibold mb-4">
              Item {index + 1}
            </h3>

            <div className="grid md:grid-cols-3 gap-4">
              <input
                placeholder="Product Name"
                value={item.name}
                onChange={(e) => {
                  const updated = [...items];
                  updated[index].name = e.target.value;
                  setItems(updated);
                }}
                className="bg-slate-950 border border-slate-700 rounded-lg p-3"
              />

              <input
                placeholder="Product URL"
                value={item.url}
                onChange={(e) => {
                  const updated = [...items];
                  updated[index].url = e.target.value;
                  setItems(updated);
                }}
                className="bg-slate-950 border border-slate-700 rounded-lg p-3"
              />

              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => {
                  const updated = [...items];
                  updated[index].quantity = Number(e.target.value);
                  setItems(updated);
                }}
                className="bg-slate-950 border border-slate-700 rounded-lg p-3"
              />
            </div>

            {items.length > 1 && (
              <button
                onClick={() =>
                  setItems(items.filter((_, i) => i !== index))
                }
                className="text-red-400 mt-4 hover:text-red-300"
              >
                Remove Item
              </button>
            )}
          </div>
        ))}

        <button
          onClick={() =>
            setItems([
              ...items,
              {
                name: "",
                url: "",
                quantity: 1,
              },
            ])
          }
          className="mt-6 text-purple-400 hover:text-purple-300"
        >
          + Add Another Item
        </button>
      </div>

      {/* Delivery Address */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-6">
          Delivery Address
        </h2>

        <select className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mb-4">
          <option>Select Saved Address</option>
          <option>John Doe - Germany</option>
        </select>

        <button className="text-purple-400 hover:text-purple-300">
          + Add New Address
        </button>
      </div>

      {/* Additional Notes */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-6">
          Additional Notes
        </h2>

        <textarea
          rows={5}
          placeholder="Optional notes for ShipIN..."
          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3"
        />
      </div>

      {/* Notice */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-8 text-amber-300">
        Requests are automatically locked after submission.
        Any modifications require contacting ShipIN support.
      </div>

      <button className="bg-purple-600 hover:bg-purple-700 px-8 py-4 rounded-xl font-semibold transition">
        Submit Request
      </button>
    </div>
  );
}