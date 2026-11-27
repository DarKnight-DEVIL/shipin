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
import dynamic from "next/dynamic";

import AdditionalServices from "@/components/request/AdditionalServices";
import AddressPicker from "@/components/address/AddressPicker";
import Modal from "@/components/ui/Modal";
import PageHeader from "@/components/ui/PageHeader";
import { auth } from "@/lib/firebase";
import { CustomerApiError, customerApi } from "@/lib/customerApiClient";
import {
  getAddresses,
  addAddress,
} from "@/features/addresses/services/addresses";
import type { Address } from "@/types/address";

// The address form carries the country/flag dataset and the phone-input stack
// (~140 KB gzip). It is only ever rendered inside a modal, and Modal returns
// null while closed, so loading it on demand keeps that weight off the initial
// page load.
const AddressForm = dynamic(() => import("@/components/address/AddressForm"), {
  ssr: false,
});

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

/** The SKU cap the API enforces; the form mirrors it so nobody types 4 items
 * into a request the server would reject. */
const MAX_ITEMS = 3;

export default function NewRequestPage() {
  const router = useRouter();

  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [showEditAddress, setShowEditAddress] = useState(false);
  const [notes, setNotes] = useState("");
  const [inspection, setInspection] = useState<
    "none" | "standard" | "detailed"
  >("standard");
  const [shippingPreference, setShippingPreference] = useState<
    "auto" | "approval" | "hold"
  >("approval");
  const [submitting, setSubmitting] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  // The age gate refuses a submit when the profile has no date of birth
  // (DOB_REQUIRED). Rather than dead-ending in Settings, the form collects it
  // inline and resubmits.
  const [needsDob, setNeedsDob] = useState(false);
  const [dobValue, setDobValue] = useState("");
  const [savingDob, setSavingDob] = useState(false);

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

  const addItem = () =>
    setItems((prev) =>
      prev.length >= MAX_ITEMS ? prev : [...prev, emptyItem()]
    );

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (
    index: number,
    field: keyof ItemDraft,
    value: string | number
  ) => {
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
      await customerApi<{ requestId: string }>('/api/requests', {
        method: "POST",
        body: {
          items: items.map((i) => ({
            name: i.name.trim(),
            url: i.url.trim(),
            quantity: i.quantity,
          })),
          addressId: selectedAddress.id,
          serviceSelections: {
            inspection,
            shippingPreference,
          },
          notes: notes.trim(),
        },
      });

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
      if (error instanceof CustomerApiError && error.code === "DOB_REQUIRED") {
        setNeedsDob(true);
        toast.error("Add your date of birth below to place this request.");
        return;
      }
      // The API's message is written for this form ("A request can include up
      // to 3 products.", "Address not found."); a network failure is not, so
      // only surface it when it is one of ours.
      toast.error(
        error instanceof CustomerApiError
          ? error.message
          : "Failed to submit request."
      );
    } finally {
      setSubmitting(false);
    }
  };

  /** The API refused the submit because the profile has no date of birth
   * (DOB_REQUIRED): save it to the profile, then retry the same submit. If the
   * date says under 18 without parental consent, the retry surfaces that
   * message through the normal error path. */
  const saveDobAndSubmit = async () => {
    const value = dobValue.trim();
    const today = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) {
      toast.warning("Enter a valid date of birth in the past.");
      return;
    }

    setSavingDob(true);
    try {
      await customerApi("/api/profile", {
        method: "PATCH",
        body: { dateOfBirth: value },
      });
      setNeedsDob(false);
      await submitRequest();
    } catch (error) {
      toast.error(
        error instanceof CustomerApiError
          ? error.message
          : "Could not save your date of birth."
      );
    } finally {
      setSavingDob(false);
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
                disabled={items.length >= MAX_ITEMS}
                title={
                  items.length >= MAX_ITEMS
                    ? "A request can include up to 3 products. Add more later as additional items."
                    : undefined
                }
                className="app-btn app-btn-secondary app-btn-sm disabled:cursor-not-allowed disabled:opacity-50"
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
                          onChange={(e) =>
                            updateItem(index, "name", e.target.value)
                          }
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
                            onChange={(e) =>
                              updateItem(index, "url", e.target.value)
                            }
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
                      {selectedAddress.addressLine2
                        ? `, ${selectedAddress.addressLine2}`
                        : ""}
                      <br />
                      {selectedAddress.city}, {selectedAddress.state}{" "}
                      {selectedAddress.postalCode}
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

          {/* Date of birth (compliance) — shown only when the API refused the
              submit for a missing DOB. */}
          {needsDob && (
            <section className="app-panel app-panel-flush">
              <div className="border-b border-[var(--border)] px-5 py-3.5">
                <h2 className="app-section-title">Date of birth</h2>
                <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                  Required before your first request (DPDP Act 2023). Saved to
                  your profile; under-18 accounts need verified parental
                  consent.
                </p>
              </div>
              <div className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label
                      htmlFor="new-request-dob"
                      className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Date of birth
                    </label>
                    <input
                      id="new-request-dob"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={dobValue}
                      onChange={(e) => setDobValue(e.target.value)}
                      className="app-input w-full"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={saveDobAndSubmit}
                    disabled={savingDob || !dobValue}
                    className="app-btn app-btn-primary shrink-0"
                  >
                    {savingDob ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save and submit"
                    )}
                  </button>
                </div>
              </div>
            </section>
          )}

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
                  <dd className="font-medium tabular-nums text-[var(--foreground)]">
                    {items.length}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">Total qty</dt>
                  <dd className="font-medium tabular-nums text-[var(--foreground)]">
                    {totalItems}
                  </dd>
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
                    {shippingPreference === "approval"
                      ? "Wait for approval"
                      : shippingPreference}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)]">Address</dt>
                  <dd className="truncate text-right font-medium text-[var(--foreground)]">
                    {selectedAddress?.label || selectedAddress?.city || "—"}
                  </dd>
                </div>
              </dl>

              {/*
                Consent at the point of collection, not buried in a policy: what
                the customer is confirming about the goods, and what this form's
                data is used for. Kept next to the submit button on purpose.
              */}
              <p className="mt-4 text-[11px] leading-5 text-[var(--muted)]">
                By submitting you confirm the items are legal to buy and export,
                and accept our <a href="/terms">Terms of Service</a>,{" "}
                <a href="/refund-policy">Refund Policy</a> and{" "}
                <a href="/privacy-policy">Privacy Policy</a>. The product links
                and address are used only to buy, inspect and ship this order.
              </p>

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
              {items.length} item{items.length === 1 ? "" : "s"} · {totalItems}{" "}
              qty
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

            const newlyCreated = updated.find(
              (item) => item.id === newAddressId
            );
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
