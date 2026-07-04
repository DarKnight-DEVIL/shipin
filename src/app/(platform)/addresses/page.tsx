"use client";

import { useState } from "react";

export default function AddressesPage() {
  const [addresses, setAddresses] = useState([
    {
      firstName: "John",
      lastName: "Doe",
      country: "Germany",
      address1: "123 Main Street",
      address2: "",
      city: "Berlin",
      state: "Berlin",
      postalCode: "10115",
      phone: "+49 123456789",
    },
  ]);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-white">
          Addresses
        </h1>

        <button className="bg-purple-600 hover:bg-purple-700 px-5 py-3 rounded-xl font-semibold transition">
          + Add Address
        </button>
      </div>

      {addresses.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
          <h2 className="text-2xl font-semibold mb-4">
            No addresses found
          </h2>

          <p className="text-slate-400">
            Add your first delivery address to start using ShipIN.
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {addresses.map((address, index) => (
            <div
              key={index}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6"
            >
              <h2 className="text-xl font-semibold mb-4">
                {address.firstName} {address.lastName}
              </h2>

              <div className="text-slate-400 space-y-1">
                <p>{address.address1}</p>

                {address.address2 && (
                  <p>{address.address2}</p>
                )}

                <p>
                  {address.city}, {address.state}
                </p>

                <p>{address.postalCode}</p>

                <p>{address.country}</p>

                <p>{address.phone}</p>
              </div>

              <div className="flex gap-4 mt-6">
                <button className="text-purple-400 hover:text-purple-300">
                  Edit
                </button>

                <button className="text-red-400 hover:text-red-300">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}