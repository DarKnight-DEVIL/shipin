"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import {
  addAddress,
  getAddresses,
  updateAddress,
} from "@/lib/addressBook";

import AddressCard from "@/components/address/AddressCard";
import AddressForm from "@/components/address/AddressForm";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import type { Address } from "@/types/address";

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAddresses = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setAddresses([]);
      setLoading(false);
      return;
    }

    try {
      const data = await getAddresses(user.uid);
      setAddresses(data);
    } catch (error) {
      console.error("Failed to load addresses:", error);
      toast.error("Couldn't load addresses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setAddresses([]);
        setLoading(false);
        return;
      }
      await loadAddresses();
    });
    return () => unsubscribe();
  }, [loadAddresses]);

  function openAddModal() {
    setEditingAddress(null);
    setShowModal(true);
  }

  function openEditModal(address: Address) {
    setEditingAddress(address);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingAddress(null);
  }

  async function handleSaveAddress(
    data: Omit<Address, "id" | "createdAt" | "updatedAt">
  ) {
    const user = auth.currentUser;
    if (!user) {
      toast.warning("Please sign in first.");
      return;
    }

    setSaving(true);
    try {
      if (editingAddress) {
        await updateAddress(user.uid, editingAddress.id, data);
        toast.success("Address updated");
      } else {
        await addAddress(user.uid, data);
        toast.success("Address saved");
      }
      await loadAddresses();
      closeModal();
    } catch (error) {
      console.error("Failed to save address:", error);
      toast.error("Couldn't save address. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="app-page">
        <div className="mb-8 h-8 w-48 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="app-panel h-48 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Shipping addresses"
        subtitle={
          addresses.length === 0
            ? "Add an address to use on new requests."
            : `${addresses.length} saved · default used for new requests`
        }
        actions={
          addresses.length > 0 ? (
            <button
              type="button"
              onClick={openAddModal}
              className="app-btn app-btn-primary app-btn-sm"
            >
              <Plus size={14} strokeWidth={2.5} />
              Add address
            </button>
          ) : undefined
        }
      />

      {/* Content */}
      {addresses.length === 0 ? (
        <EmptyState
          icon={<MapPin size={22} />}
          title="No addresses yet"
          description="Save a shipping address so you don't have to type it every time you create a request."
          action={
            <button
              type="button"
              onClick={openAddModal}
              className="app-btn app-btn-primary"
            >
              <Plus size={15} strokeWidth={2.5} />
              Add address
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={openEditModal}
              onRefresh={loadAddresses}
            />
          ))}
        </div>
      )}

      <Modal
        open={showModal}
        title={editingAddress ? "Edit address" : "New address"}
        onClose={closeModal}
      >
        <AddressForm
          key={editingAddress?.id ?? "new"}
          initialData={editingAddress ?? undefined}
          onSubmit={handleSaveAddress}
          submitting={saving}
        />
      </Modal>
    </div>
  );
}