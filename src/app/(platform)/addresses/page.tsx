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
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-8 h-8 w-48 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Shipping addresses
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {addresses.length === 0
              ? "Add an address to use on new requests."
              : `${addresses.length} saved · default used for new requests`}
          </p>
        </div>

        {addresses.length > 0 && (
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <Plus size={16} strokeWidth={2.5} />
            Add
          </button>
        )}
      </div>

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
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              <Plus size={16} strokeWidth={2.5} />
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