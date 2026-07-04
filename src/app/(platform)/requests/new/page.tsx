"use client";

import { useEffect, useState } from "react";
import { getAddresses } from "@/lib/firestore";
import { auth } from "@/lib/firebase";

export default function NewRequestPage() {
  const [items, setItems] = useState([
    {
      name: "",
      url: "",
      quantity: 1,
    },
  ]);

  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      const data = await getAddresses(user.uid);
      setAddresses(data);

      if (data.length > 0) {
        setSelectedAddress(data[0].id);
      }
    });

    return () => unsubscribe();
  }, []);

  const addItem = () => {
    setItems([
      ...items,
      {
        name: "",
        url: "",
        quantity: 1,
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (
    index: number,
    field: string,
    value: string | number
  ) => {
    const updated = [...items];

    updated[index] = {
      ...updated[index],
      [field]: value,
    };

    setItems(updated);
  };

  const submitRequest = () => {
    console.log({
      items,
      selectedAddress,
      notes,
    });

    alert(
      "Request submission to Firestore will be connected next."
    );
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-4xl font-bold text-white mb-2">
        Create Request
      </h1>

      <p className="text-slate-400 mb-8">
        Submit products you'd like ShipIN to purchase and forward to you.
      </p>

      {/* Items */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-2xl font-semibold text-white mb-6">
          Items
        </h2>

        {items.map((item, index) => (
          <div
            key={index}
            className="border border-slate-800 rounded-xl p-4 mb-4"
          >
            <h3 className="font-semibold text-white mb-4">
              Item {index + 1}
            </h3>

            <div className="grid md:grid-cols-3 gap-4">
              <input
                placeholder="Product Name"
                value={item.name}
                onChange={(e) =>
                  updateItem(
                    index,
                    "name",
                    e.target.value
                  )
                }
                className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-white"
              />

              <input
                placeholder="Product URL"
                value={item.url}
                onChange={(e) =>
                  updateItem(
                    index,
                    "url",
                    e.target.value
                  )
                }
                className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-white"
              />

              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) =>
                  updateItem(
                    index,
                    "quantity",
                    Number(e.target.value)
                  )
                }
                className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-white"
              />
            </div>

            {items.length > 1 && (
              <button
                onClick={() => removeItem(index)}
                className="text-red-400 hover:text-red-300 mt-4"
              >
                Remove Item
              </button>
            )}
          </div>
        ))}

        <button
          onClick={addItem}
          className="text-purple-400 hover:text-purple-300 mt-4"
        >
          + Add Another Item
        </button>
      </div>

      {/* Address */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-2xl font-semibold text-white mb-6">
          Delivery Address
        </h2>

        {addresses.length === 0 ? (
          <div className="text-slate-400">
            No saved addresses found.
          </div>
        ) : (
          <select
            value={selectedAddress}
            onChange={(e) =>
              setSelectedAddress(e.target.value)
            }
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white"
          >
            {addresses.map((address) => (
              <option
                key={address.id}
                value={address.id}
              >
                {address.firstName}{" "}
                {address.lastName} -{" "}
                {address.country}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Notes */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-2xl font-semibold text-white mb-6">
          Additional Notes
        </h2>

        <textarea
          rows={5}
          value={notes}
          onChange={(e) =>
            setNotes(e.target.value)
          }
          placeholder="Optional notes for ShipIN..."
          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white"
        />
      </div>

      {/* Notice */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-8 text-amber-300">
        Requests are automatically locked after
        submission. Any modifications require
        contacting ShipIN support.
      </div>

      <button
        onClick={submitRequest}
        className="bg-purple-600 hover:bg-purple-700 px-8 py-4 rounded-xl font-semibold transition"
      >
        Submit Request
      </button>
    </div>
  );
}