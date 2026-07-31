"use client";

import { useCallback, useEffect, useState } from "react";

import { auth } from "@/lib/firebase";
import {
  addAddress,
  getAddresses,
  updateAddress,
} from "@/lib/addressBook";

import AddressCard from "@/components/address/AddressCard";
import AddressForm from "@/components/address/AddressForm";
import Modal from "@/components/ui/Modal";

import type { Address } from "@/types/address";

export default function AddressesPage() {
  const [addresses, setAddresses] =
    useState<Address[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [showModal, setShowModal] =
    useState(false);

  const [editingAddress, setEditingAddress] =
    useState<Address | null>(null);

  /*
   * LOAD ADDRESSES
   */
  const loadAddresses =
    useCallback(async () => {
      const user = auth.currentUser;

      if (!user) {
        setAddresses([]);
        setLoading(false);
        return;
      }

      try {
        const data =
          await getAddresses(user.uid);

        setAddresses(data);
      } catch (error) {
        console.error(
          "Failed to load addresses:",
          error
        );
      } finally {
        setLoading(false);
      }
    }, []);

  /*
   * AUTH LISTENER
   */
  useEffect(() => {
    const unsubscribe =
      auth.onAuthStateChanged(
        async (user) => {
          if (!user) {
            setAddresses([]);
            setLoading(false);
            return;
          }

          await loadAddresses();
        }
      );

    return () => unsubscribe();
  }, [loadAddresses]);

  /*
   * OPEN ADD MODAL
   */
  function openAddModal() {
    setEditingAddress(null);
    setShowModal(true);
  }

  /*
   * OPEN EDIT MODAL
   */
  function openEditModal(
    address: Address
  ) {
    setEditingAddress(address);
    setShowModal(true);
  }

  /*
   * CLOSE MODAL
   */
  function closeModal() {
    setShowModal(false);
    setEditingAddress(null);
  }

  /*
   * SAVE ADDRESS
   */
  async function handleSaveAddress(
    data: Omit<
      Address,
      "id" | "createdAt" | "updatedAt"
    >
  ) {
    const user = auth.currentUser;

    if (!user) {
      alert("Please login first.");
      return;
    }

    try {
      /*
       * EDIT EXISTING ADDRESS
       */
      if (editingAddress) {
        await updateAddress(
          user.uid,
          editingAddress.id,
          data
        );
      }

      /*
       * CREATE NEW ADDRESS
       */
      else {
        await addAddress(
          user.uid,
          data
        );
      }

      await loadAddresses();

      closeModal();
    } catch (error) {
      console.error(
        "Failed to save address:",
        error
      );

      alert(
        "Unable to save address. Please try again."
      );
    }
  }

  /*
   * LOADING
   */
  if (loading) {
    return (
      <div className="p-8 text-slate-600 dark:text-slate-400">
        Loading addresses...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-8">

      {/* HEADER */}

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <h1 className="text-4xl font-bold text-slate-950 dark:text-white">
            Addresses
          </h1>

          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Manage your saved shipping addresses.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-700"
        >
          + Add Address
        </button>

      </div>

      {/* EMPTY STATE */}

      {addresses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-purple-100 text-2xl dark:bg-purple-500/10">
            📍
          </div>

          <h2 className="mb-2 text-2xl font-semibold text-slate-950 dark:text-white">
            No addresses yet
          </h2>

          <p className="mb-6 text-slate-600 dark:text-slate-400">
            Add your first shipping address to use it when creating requests.
          </p>

          <button
            type="button"
            onClick={openAddModal}
            className="rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-700"
          >
            Add Your First Address
          </button>

        </div>
      ) : (

        /* ADDRESS GRID */

        <div className="grid gap-6 lg:grid-cols-2">

          {addresses.map(
            (address) => (
              <AddressCard
                key={address.id}
                address={address}
                onEdit={openEditModal}
                onRefresh={
                  loadAddresses
                }
              />
            )
          )}

        </div>
      )}

      {/* ADD / EDIT MODAL */}

      <Modal
        open={showModal}
        title={
          editingAddress
            ? "Edit Address"
            : "Add Address"
        }
        onClose={closeModal}
      >
        <AddressForm
          key={
            editingAddress?.id ??
            "new-address"
          }
          initialData={
            editingAddress ??
            undefined
          }
          onSubmit={
            handleSaveAddress
          }
        />
      </Modal>

    </div>
  );
}