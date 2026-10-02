"use client";

import { useEffect, useState } from "react";
import { MapPinOff } from "lucide-react";

import { auth } from "@/lib/firebase";
import { getAddresses, addAddress } from "@/lib/addressBook";

import AddressCard from "@/components/address/AddressCard";
import Modal from "@/components/ui/Modal";
import AddressForm from "@/components/address/AddressForm";
import PageSkeleton from "@/components/ui/PageSkeleton";
import EmptyState from "@/components/ui/EmptyState";

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Step 5.6: Added the tracking state for editing addresses
  const [editingAddress, setEditingAddress] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(
      async (user) => {
        if (!user) return;

        const data = await getAddresses(user.uid);
        setAddresses(data);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  // Step 5.7: Created the asynchronous state refreshment helper
  async function refreshAddresses() {
    const user = auth.currentUser;
    if (!user) return;

    const updated = await getAddresses(user.uid);
    setAddresses(updated);
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-white">
          Address Book
        </h1>

        <button
          onClick={() => setShowModal(true)}
          className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-xl font-semibold text-white"
        >
          + Add Address
        </button>
      </div>

      {addresses.length === 0 ? (
        <EmptyState
          icon={<MapPinOff size={26} />}
          title="No saved addresses"
          description="Add a shipping address so you can use it when creating your next request."
          action={
            <button
              type="button"
              onClick={() => {
                setEditingAddress(null);
                setShowModal(true);
              }}
              className="rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
            >
              Add Address
            </button>
          }
        />
      ) : (
        <div className="grid lg:grid-cols-2 gap-6 text-white">
          {/* Step 5.8: Mapped out custom onRefresh and onEdit pipes onto the cards */}
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onRefresh={refreshAddresses}
              onEdit={(address) => {
                setEditingAddress(address);
                setShowModal(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Step 5.9: Refactored modal container to handle creation vs modification logic */}
      <Modal
        open={showModal}
        title={editingAddress ? "Edit Address" : "Add Address"}
        onClose={() => {
          setShowModal(false);
          setEditingAddress(null);
        }}
      >
        <AddressForm
          initialData={editingAddress ?? undefined}
          onSubmit={async (address) => {
            const user = auth.currentUser;
            if (!user) return;

            if (editingAddress) {
              const { updateAddress } = await import("@/lib/addressBook");
              await updateAddress(user.uid, editingAddress.id, address);
            } else {
              await addAddress(user.uid, address);
            }

            await refreshAddresses();
            setEditingAddress(null);
            setShowModal(false);
          }}
        />
      </Modal>
    </div>
  );
}