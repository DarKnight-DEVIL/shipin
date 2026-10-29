"use client";

import { useEffect, useState } from "react";
import { MapPinOff, Plus } from "lucide-react";

import { auth } from "@/lib/firebase";
import { getAddresses, addAddress } from "@/lib/addressBook";

import AddressCard from "@/components/address/AddressCard";
import Modal from "@/components/ui/Modal";
import AddressForm from "@/components/address/AddressForm";
import PageSkeleton from "@/components/ui/PageSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Step 5.6: Added the tracking state for editing addresses
  const [editingAddress, setEditingAddress] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(
      async (user) => {
        if (!user) {
          setLoading(false);
          return;
        }

        try {
          const data = await getAddresses(user.uid);
          setAddresses(data);
        } catch (error) {
          console.error("Address loading failed:", error);
        } finally {
          setLoading(false);
        }
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
      <div className="app-page">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="app-page">
      <PageHeader
        title="Address book"
        subtitle="Saved shipping addresses used when you create a request"
        actions={
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="app-btn app-btn-primary app-btn-sm"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add address
          </button>
        }
      />

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
              className="app-btn app-btn-primary"
            >
              Add Address
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
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