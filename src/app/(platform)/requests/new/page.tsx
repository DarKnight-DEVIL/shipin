"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Link2,
  MapPin,
  MapPinOff,
  Plus,
  Trash2,
  Minus,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import AdditionalServices from "@/components/request/AdditionalServices";
import AddressPicker from "@/components/address/AddressPicker";
import AddressForm from "@/components/address/AddressForm";
import Modal from "@/components/ui/Modal";
import PageHeader from "@/components/ui/PageHeader";
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
    <div className="app-page">
      <PageHeader
        eyebrow="New request"
        title="Create request"
        subtitle="Paste product links from India. We purchase, inspect and ship them to you."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        {/* ── Main column ── */}
        <div className="space-y-5">
          {/* Items */}
          <section className="app-panel app-panel-flush">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
              <div>
                <h2 className="app-section-title">Items</h2>
                <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                  {items.length} product{items.length === 1 ? "" : "s"} ·{" "}
                  {totalItems} total qty
                </p>
              </div>

              <button
                type="button"
                onClick={addItem}
                className="app-btn app-btn-secondary app-btn-sm"
              >
                <Plus size={14} />
                Add item
              </button>
            </div>

            <div className="divide-y divide-[var(--border)]">
              {items.map((item, index) => (
                <div key={index} className="px-5 py-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="app-kicker">Item {index + 1}</span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--muted)] transition-colors hover:text-rose-600 dark:hover:text-rose-400"
                      >
                        <Trash2 size={12} />
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-3">
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
                      <div className="flex items-center justify-between rounded-[9px] border border-[var(--border)] bg-[var(--card)] p-0.5">
                        <button
                          type="button"
                          onClick={() => adjustQuantity(index, -1)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="min-w-[2ch] text-center text-[13px] font-semibold tabular-nums text-[var(--foreground)]">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustQuantity(index, 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
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
          <section className="app-panel app-panel-flush">
            <div className="border-b border-[var(--border)] px-5 py-3.5">
              <h2 className="app-section-title">Delivery address</h2>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                Where we ship after warehouse processing
              </p>
            </div>

            <div className="p-5">
              {loadingAddresses ? (
                <div className="flex h-24 items-center justify-center text-sm text-[var(--muted)]">
                  Loading addresses…
                </div>
              ) : selectedAddress ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
                        {selectedAddress.label || "Address"}
                      </h3>
                      {selectedAddress.isDefault && (
                        <span className="rounded-full bg-[color-mix(in_srgb,var(--accent-solid)_12%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[13px] font-medium text-[var(--foreground)]">
                      {selectedAddress.recipientName}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-5 text-[var(--muted)]">
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
                      className="app-btn app-btn-secondary app-btn-sm"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEditAddress(true)}
                      className="app-btn app-btn-secondary app-btn-sm"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <MapPinOff
                      size={16}
                      className="mt-0.5 shrink-0 text-[var(--muted-soft)]"
                    />
                    <div>
                      <p className="text-[13px] font-medium text-[var(--foreground)]">
                        No saved address
                      </p>
                      <p className="mt-0.5 text-[12px] leading-5 text-[var(--muted)]">
                        Add a shipping address before submitting this request.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddAddress(true)}
                    className="app-btn app-btn-primary app-btn-sm shrink-0"
                  >
                    <MapPin size={13} />
                    Add address
                  </button>
                </div>
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
          <section className="app-panel app-panel-flush">
            <div className="border-b border-[var(--border)] px-5 py-3.5">
              <h2 className="app-section-title">Notes</h2>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                Optional — size, colour, alternatives, anything else we should
                know
              </p>
            </div>

            <div className="p-5">
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the team should know before purchasing…"
                className="app-textarea min-h-[110px]"
              />
            </div>
          </section>
        </div>

        {/* ── Sidebar summary (desktop) ── */}
        <aside className="hidden xl:block">
          <div className="sticky top-8 space-y-4">
            <div className="app-panel p-5">
              <h3 className="app-kicker">Summary</h3>

              <dl className="mt-3.5 space-y-2.5 text-[12px]">
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">Products</dt>
                  <dd className="font-medium tabular-nums text-[var(--foreground)]">{items.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">Total qty</dt>
                  <dd className="font-medium tabular-nums text-[var(--foreground)]">{totalItems}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">Inspection</dt>
                  <dd className="font-medium capitalize text-[var(--foreground)]">
                    {inspection}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">Shipping</dt>
                  <dd className="font-medium capitalize text-[var(--foreground)]">
                    {shippingPreference === "approval" ? "Wait for approval" : shippingPreference}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)]">Address</dt>
                  <dd className="truncate text-right font-medium text-[var(--foreground)]">
                    {selectedAddress?.label || selectedAddress?.city || "—"}
                  </dd>
                </div>
              </dl>

              <div className="app-notice-warning mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11px] leading-5 text-amber-800 dark:text-amber-300">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>Requests lock after submit. Changes need support.</span>
              </div>

              <button
                type="button"
                onClick={submitRequest}
                disabled={submitting || !selectedAddress}
                className="app-btn app-btn-primary app-btn-lg app-btn-block mt-4"
              >
                {submitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
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

      {/* Spacer for the mobile submit bar */}
      <div className="h-24 xl:hidden" />

      {/* Mobile sticky submit */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--card)]/95 px-4 py-3 backdrop-blur-xl xl:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1 text-[12px]">
            <p className="font-medium text-[var(--foreground)]">
              {items.length} item{items.length === 1 ? "" : "s"} · {totalItems} qty
            </p>
            <p className="truncate text-[var(--muted)]">
              {selectedAddress
                ? selectedAddress.label || selectedAddress.city
                : "No address selected"}
            </p>
          </div>
          <button
            type="button"
            onClick={submitRequest}
            disabled={submitting || !selectedAddress}
            className="app-btn app-btn-primary shrink-0"
          >
            {submitting ? (
              <Loader2 size={15} className="animate-spin" />
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
    </div>
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
      <span className="app-label mb-1.5">{label}</span>
      {children}
    </label>
  );
}
