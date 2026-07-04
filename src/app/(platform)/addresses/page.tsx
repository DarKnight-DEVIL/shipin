"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { addAddress, getAddresses } from "@/lib/firestore";

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  const [newAddress, setNewAddress] = useState({
    country: "",
    firstName: "",
    lastName: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    postalCode: "",
    phone: "",
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      const data = await getAddresses(user.uid);
      setAddresses(data);
    });

    return () => unsubscribe();
  }, []);

  const saveAddress = async () => {
    const user = auth.currentUser;

    if (!user) {
      alert("Please login first.");
      return;
    }

    await addAddress(newAddress, user.uid);

    const updated = await getAddresses(user.uid);
    setAddresses(updated);

    setNewAddress({
      country: "",
      firstName: "",
      lastName: "",
      address1: "",
      address2: "",
      city: "",
      state: "",
      postalCode: "",
      phone: "",
    });

    setShowModal(false);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-white">
          Addresses
        </h1>

        <button
          onClick={() => setShowModal(true)}
          className="bg-purple-600 hover:bg-purple-700 px-5 py-3 rounded-xl font-semibold"
        >
          + Add Address
        </button>
      </div>

      {addresses.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
          <h2 className="text-2xl font-semibold text-white mb-4">
            No addresses found
          </h2>

          <p className="text-slate-400">
            Add your first address to continue.
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {addresses.map((address) => (
            <div
              key={address.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6"
            >
              <h2 className="text-xl font-semibold text-white mb-4">
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
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center p-4 z-50">
          <div className="bg-slate-900 p-6 rounded-2xl w-full max-w-2xl border border-slate-800">
            <h2 className="text-2xl font-bold text-white mb-6">
              Add Address
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
              {Object.entries(newAddress).map(([key, value]) => (
                <input
                  key={key}
                  placeholder={key}
                  value={value}
                  onChange={(e) =>
                    setNewAddress({
                      ...newAddress,
                      [key]: e.target.value,
                    })
                  }
                  className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-white"
                />
              ))}
            </div>

            <div className="flex justify-end gap-4 mt-8">
              <button
                onClick={() => setShowModal(false)}
                className="border border-slate-700 px-6 py-3 rounded-xl"
              >
                Cancel
              </button>

              <button
                onClick={saveAddress}
                className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-xl"
              >
                Save Address
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}