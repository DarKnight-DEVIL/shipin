"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Link2,
  MapPin,
  MapPinOff,
  Package,
  Plus,
  Trash2,
  Minus,
  Loader2,
  StickyNote,
  AlertTriangle,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import AdditionalServices from "@/components/request/AdditionalServices";
import AddressPicker from "@/components/address/AddressPicker";
import AddressForm from "@/components/address/AddressForm";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { auth } from "@/lib/firebase";
import { addRequest } from "@/lib/firestore";
import { getAddresses, addAddress } from "@/lib/addressBook";
import type { Address } from "@/types/address";

type ItemDraft = {
  name: string;
  url: string;
  quantity: number;
};

const emptyItem = (): ItemDraft => ({
  name: "",
  url: "",
  quantity: 1,
});

export default function NewRequestPage() {
  const router = useRouter();

  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [showEditAddress, setShowEditAddress] = useState(false);
  const [notes, setNotes] = useState("");
  const [inspection, setInspection] = useState<"none" | "standard" | "detailed">("standard");
  const [shippingPreference, setShippingPreference] = useState<"auto" | "approval" | "hold">("approval");
  const [submitting, setSubmitting] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setLoadingAddresses(false);
        return;
      }

      try {
        const data = await getAddresses(user.uid);
        setAddresses(data);
        if (data.length > 0) {
          const defaultAddress = data.find((a) => a.isDefault);
          setSelectedAddress(defaultAddress ?? data[0]);
        }
      } finally {
        setLoadingAddresses(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemDraft, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const adjustQuantity = (index: number, delta: number) => {
    setItems((prev) => {
      const next = [...prev];
      const q = Math.max(1, (next[index].quantity || 1) + delta);
      next[index] = { ...next[index], quantity: q };
      return next;
    });
  };

  const submitRequest = async () => {
    const user = auth.currentUser;
    if (!user) {
      toast.warning("Please login again.");
      return;
    }
    if (items.some((item) => !item.name.trim() || !item.url.trim())) {
      toast.warning("Please complete all item details.");
      return;
    }
    if (!selectedAddress) {
      toast.warning("Please select an address.");
      return;
    }

    setSubmitting(true);
    try {
      await addRequest(
        {
          items: items.map((i) => ({
            name: i.name.trim(),
            url: i.url.trim(),
            quantity: i.quantity,
          })),
          shippingAddress: selectedAddress,
          serviceSelections: {
            inspection,
            shippingPreference,
          },
          notes: notes.trim(),
          email: user.email,
          customerName: user.displayName || "Customer",
        },
        user.uid
      );

      toast.success("Request submitted successfully!");
      setItems([emptyItem()]);
      setNotes("");
      setInspection("standard");
      setShippingPreference("approval");

      const updatedAddresses = await getAddresses(user.uid);
      setAddresses(updatedAddresses);
      const defaultAddress = updatedAddresses.find((a) => a.isDefault);
      setSelectedAddress(defaultAddress ?? updatedAddresses[0] ?? null);

      router.push("/requests");
    } catch (error) {
      console.error(error);
      toast.error("Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalItems = items.reduce((sum, i) => sum + (i.quantity || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="shipin-page w-full px-6 py-8 pb-28 lg:px-10"
    >
      {/* Header */}
      <div className="mb-8">
        <p className="mb-1 text-sm font-medium text-purple-600 dark:text-purple-400">
          New request
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
          Create request
        </h1>
        <p className="mt-2 max-w-xl text-slate-600 dark:text-slate-400">
          Paste product links from India. We'll purchase, inspect, and ship them to you.
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
        {/* ── Main column ── */}
        <div className="space-y-6">
          {/* Items */}
          <section className="shipin-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Package size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                    Items
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {items.length} product{items.length === 1 ? "" : "s"} · {totalItems} total qty
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-purple-600 transition hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-500/10"
              >
                <Plus size={16} />
                Add item
              </button>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {items.map((item, index) => (
                <div key={index} className="space-y-4 px-5 py-5 sm:px-6">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Item {index + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-4">
                      <Field label="Product name">
                        <input
                          value={item.name}
                          onChange={(e) => updateItem(index, "name", e.target.value)}
                          placeholder="e.g. Sony WH-1000XM5"
                          className="shipin-input"
                        />
                      </Field>

                      <Field label="Product URL">
                        <div className="relative">
                          <Link2
                            size={16}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          />
                          <input
                            value={item.url}
                            onChange={(e) => updateItem(index, "url", e.target.value)}
                            placeholder="https://amazon.in/..."
                            className="shipin-input pl-10"
                          />
                        </div>
                      </Field>
                    </div>

                    <Field label="Qty" className="sm:w-28">
                      <div className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-950">
                        <button
                          type="button"
                          onClick={() => adjustQuantity(index, -1)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="min-w-[2ch] text-center text-sm font-semibold tabular-nums text-slate-950 dark:text-white">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustQuantity(index, 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                          aria-label="Increase quantity"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Delivery address */}
          <section className="shipin-card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <MapPin size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  Delivery address
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Where we ship after warehouse processing
                </p>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {loadingAddresses ? (
                <div className="flex h-24 items-center justify-center text-sm text-slate-500">
                  Loading addresses…
                </div>
              ) : selectedAddress ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-950 dark:text-white">
                        {selectedAddress.label || "Address"}
                      </h3>
                      {selectedAddress.isDefault && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-slate-950 dark:text-white">
                      {selectedAddress.recipientName}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
                      {selectedAddress.addressLine1}
                      {selectedAddress.addressLine2 ? `, ${selectedAddress.addressLine2}` : ""}
                      <br />
                      {selectedAddress.city}, {selectedAddress.state} {selectedAddress.postalCode}
                      <br />
                      {selectedAddress.country}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddressPicker(true)}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEditAddress(true)}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<MapPinOff size={26} />}
                  title="No saved address"
                  description="Add a shipping address before submitting this request."
                  action={
                    <button
                      type="button"
                      onClick={() => setShowAddAddress(true)}
                      className="shipin-btn-primary px-5 py-3 text-sm"
                    >
                      Add address
                    </button>
                  }
                />
              )}
            </div>
          </section>

          {/* Additional services */}
          <AdditionalServices
            inspection={inspection}
            shipping={shippingPreference}
            onInspectionChange={setInspection}
            onShippingChange={setShippingPreference}
          />

          {/* Notes */}
          <section className="shipin-card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <StickyNote size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  Notes
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Optional — size, color, alternatives, etc.
                </p>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the team should know before purchasing…"
                className="shipin-input min-h-[120px] resize-y"
              />
            </div>
          </section>
        </div>

        {/* ── Sidebar summary (desktop) ── */}
        <aside className="hidden xl:block">
          <div className="sticky top-8 space-y-4">
            <div className="shipin-card p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Summary
              </h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Products</dt>
                  <dd className="font-medium text-slate-950 dark:text-white">{items.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Total qty</dt>
                  <dd className="font-medium text-slate-950 dark:text-white">{totalItems}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Inspection</dt>
                  <dd className="font-medium capitalize text-slate-950 dark:text-white">
                    {inspection}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Shipping</dt>
                  <dd className="font-medium capitalize text-slate-950 dark:text-white">
                    {shippingPreference === "approval" ? "Wait for approval" : shippingPreference}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Address</dt>
                  <dd className="truncate text-right font-medium text-slate-950 dark:text-white">
                    {selectedAddress?.label || selectedAddress?.city || "—"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  Requests lock after submit. Changes need support.
                </span>
              </div>

              <button
                type="button"
                onClick={submitRequest}
                disabled={submitting || !selectedAddress}
                className="shipin-btn-primary mt-5 flex w-full items-center justify-center gap-2 px-5 py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit request"
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile sticky submit */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95 xl:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-slate-950 dark:text-white">
              {items.length} item{items.length === 1 ? "" : "s"} · {totalItems} qty
            </p>
            <p className="truncate text-slate-500 dark:text-slate-400">
              {selectedAddress
                ? selectedAddress.label || selectedAddress.city
                : "No address selected"}
            </p>
          </div>
          <button
            type="button"
            onClick={submitRequest}
            disabled={submitting || !selectedAddress}
            className="shipin-btn-primary shrink-0 px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "Submit"
            )}
          </button>
        </div>
      </div>

      {/* Modals */}
      <Modal
        open={showAddressPicker}
        title="Select address"
        onClose={() => setShowAddressPicker(false)}
      >
        <AddressPicker
          addresses={addresses}
          selected={selectedAddress ?? undefined}
          onSelect={(address) => {
            setSelectedAddress(address);
            setShowAddressPicker(false);
          }}
          onAddNew={() => {
            setShowAddressPicker(false);
            setShowAddAddress(true);
          }}
        />
      </Modal>

      <Modal
        open={showAddAddress}
        title="Add address"
        onClose={() => setShowAddAddress(false)}
      >
        <AddressForm
          onSubmit={async (address) => {
            const user = auth.currentUser;
            if (!user) return;

            const newAddressId = await addAddress(user.uid, address);
            const updated = await getAddresses(user.uid);
            setAddresses(updated);

            const newlyCreated = updated.find((item) => item.id === newAddressId);
            if (newlyCreated) setSelectedAddress(newlyCreated);
            setShowAddAddress(false);
          }}
        />
      </Modal>

      <Modal
        open={showEditAddress}
        title="Edit address for this request"
        onClose={() => setShowEditAddress(false)}
      >
        {selectedAddress && (
          <AddressForm
            initialData={selectedAddress}
            onSubmit={async (data) => {
              // Snapshot only for this request — leave the address book unchanged
              setSelectedAddress({
                ...selectedAddress,
                ...data,
              });
              setShowEditAddress(false);
              toast.success("Address updated for this request");
            }}
          />
        )}
      </Modal>
    </motion.div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}