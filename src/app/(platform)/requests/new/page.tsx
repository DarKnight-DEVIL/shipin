"use client";

import AdditionalServices from "@/components/request/AdditionalServices";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { addRequest } from "@/lib/firestore";
import AddressCard from "@/components/address/AddressCard";
import type { Address } from "@/types/address";
import { toast } from "sonner";
import { MapPinOff } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { useRouter } from "next/navigation";

// Step 8.1: Imports added here
import Modal from "@/components/ui/Modal";
import AddressPicker from "@/components/address/AddressPicker";
import AddressForm from "@/components/address/AddressForm";
import { getAddresses, addAddress } from "@/lib/addressBook";

export default function NewRequestPage() {
  const router = useRouter();

  const [items, setItems] = useState([
    {
      name: "",
      url: "",
      quantity: 1,
    },
  ]);

  const [addresses, setAddresses] = useState<Address[]>([]);
  
  // Track the entire address object rather than just the string ID string
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);

  // Step 8.2: New states added below selectedAddress
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);

  const [notes, setNotes] = useState("");

  // Additional Services states
  const [inspection, setInspection] = useState<"none" | "standard" | "detailed">("standard");
  const [shippingPreference, setShippingPreference] = useState<"auto" | "approval" | "hold">("approval");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      const data = await getAddresses(user.uid);
      setAddresses(data);

      // Load the Default Address
      if (data.length > 0) {
        const defaultAddress = data.find((a) => a.isDefault);
        setSelectedAddress(defaultAddress ?? data[0]);
      }
    });

    return () => unsubscribe();
  }, []);

  const addItem = () => {
    setItems([
      ...items,
      {
        name: "",
        url: "",
        quantity: 1,
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setItems(updated);
  };

  const handleAddressChange = (id: string) => {
    const found = addresses.find((a) => a.id === id);
    setSelectedAddress(found || null);
  };

  const submitRequest = async () => {
    const user = auth.currentUser;

    if (!user) {
      toast.warning("Please login again.");
      return;
    }

    if (items.some((item) => !item.name || !item.url)) {
      toast.warning("Please complete all item details.");
      return;
    }

    // Validation
    if (!selectedAddress) {
      toast.warning("Please select an address.");
      return;
    }

    try {
      // Update the Submit Function
      await addRequest(
        {
          items,
          shippingAddress: selectedAddress,
          serviceSelections: {
            inspection,
            shippingPreference,
          },
          notes,
          email: user.email,
          customerName: user.displayName || "Customer",
        },
        user.uid
      );

      toast.success("Request submitted successfully!");

      setItems([
        {
          name: "",
          url: "",
          quantity: 1,
        },
      ]);
      setNotes("");
      setInspection("standard");
      setShippingPreference("approval");

      // Reset After Submission
      const updatedAddresses = await getAddresses(user.uid);
      setAddresses(updatedAddresses);
      const defaultAddress = updatedAddresses.find((a) => a.isDefault);
      setSelectedAddress(defaultAddress ?? updatedAddresses[0] ?? null);
      
    } catch (error) {
      console.error(error);
      toast.error("Failed to submit request.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-8 text-slate-900 dark:text-white">
      <h1 className="mb-2 text-4xl font-bold text-slate-950 dark:text-white">Create Request</h1>

      <p className="mb-8 text-slate-600 dark:text-slate-400">
        Submit products you'd like ShipIN to purchase and forward to you.
      </p>

      {/* Items */}
      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <h2 className="mb-6 text-2xl font-semibold text-slate-950 dark:text-white">Items</h2>

        {items.map((item, index) => (
          <div key={index} className="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <h3 className="mb-4 font-semibold text-slate-950 dark:text-white">Item {index + 1}</h3>

            <div className="grid gap-4 md:grid-cols-3">
              <input
                placeholder="Product Name"
                value={item.name}
                onChange={(e) => updateItem(index, "name", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
              />

              <input
                placeholder="Product URL"
                value={item.url}
                onChange={(e) => updateItem(index, "url", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
              />

              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => updateItem(index, "quantity", Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
              />
            </div>

            {items.length > 1 && (
              <button
                onClick={() => removeItem(index)}
                className="mt-4 text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
              >
                Remove Item
              </button>
            )}
          </div>
        ))}

        <button
          onClick={addItem}
          className="mt-4 text-purple-600 hover:text-purple-500 dark:text-purple-400 dark:hover:text-purple-300"
        >
          + Add Another Item
        </button>
      </div>

      {/* Replaced Address Section / Dropdown Block */}
      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <h2 className="mb-6 text-2xl font-semibold text-slate-950 dark:text-white">
          Delivery Address
        </h2>

        {addresses.length > 0 && (
          <div className="mb-4">
            <select
              value={selectedAddress?.id || ""}
              onChange={(e) => handleAddressChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
            >
              {addresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label || "Address"} ({address.recipientName} - {address.country})
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedAddress ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950/40">
            {/* Step 8.3: Updated to items-start layout and injected structural management action buttons */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-950 dark:text-white">
                  {selectedAddress.label}
                  {selectedAddress.isDefault && (
                    <span className="ml-2 text-green-600 dark:text-green-400">
                      ★ Default
                    </span>
                  )}
                </h3>

                <p className="mt-3 text-slate-950 dark:text-white">
                  {selectedAddress.recipientName}
                </p>

                <p className="text-slate-600 dark:text-slate-400">
                  {selectedAddress.addressLine1}
                </p>

                {selectedAddress.addressLine2 && (
                  <p className="text-slate-600 dark:text-slate-400">
                    {selectedAddress.addressLine2}
                  </p>
                )}

                <p className="text-slate-600 dark:text-slate-400">
                  {selectedAddress.city}, {selectedAddress.state}
                </p>

                <p className="text-slate-600 dark:text-slate-400">
                  {selectedAddress.country}
                </p>

                <p className="text-slate-600 dark:text-slate-400">
                  {selectedAddress.postalCode}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowAddressPicker(true)}
                  className="rounded-xl bg-purple-600 px-5 py-2 font-medium text-white transition hover:bg-purple-700"
                >
                  Change Address
                </button>

                <button
                  onClick={() => setShowAddAddress(true)}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2 font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                >
                  + New Address
                </button>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<MapPinOff size={26} />}
            title="No saved address"
            description="You need a shipping address before you can submit this request."
            action={
              <button
                type="button"
                onClick={() => router.push("/addresses")}
                className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
              >
                Add Address
              </button>
            }
          />
        )}
      </div>

      {/* Additional Services */}
      <div className="mb-8">
        <AdditionalServices
          inspection={inspection}
          shipping={shippingPreference}
          onInspectionChange={setInspection}
          onShippingChange={setShippingPreference}
        />
      </div>

      {/* Notes */}
      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <h2 className="mb-6 text-2xl font-semibold text-slate-950 dark:text-white">Additional Notes</h2>

        <textarea
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes for ShipIN..."
          className="w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
        />
      </div>

      {/* Notice */}
      <div className="mb-8 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300">
        Requests are automatically locked after submission. Any modifications require contacting ShipIN support.
      </div>

      <button
        onClick={submitRequest}
        className="rounded-xl bg-purple-600 px-8 py-4 font-semibold text-white transition hover:bg-purple-700"
      >
        Submit Request
      </button>

      {/* Step 8.4: Inline Address Picker Overlay Window Modal */}
      <Modal
        open={showAddressPicker}
        title="Select Address"
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

      {/* Step 8.5: Inline Address Creation Submission Form Modal */}
      <Modal
        open={showAddAddress}
        title="Add Address"
        onClose={() => setShowAddAddress(false)}
      >
        <AddressForm
          onSubmit={async (address) => {
            const user = auth.currentUser;
            if (!user) return;

            const newAddressId = await addAddress(
              user.uid,
              address
            );

            const updated = await getAddresses(
              user.uid
            );

            setAddresses(updated);

            const newlyCreatedAddress =
              updated.find(
                (item) =>
                  item.id === newAddressId
              );

            if (newlyCreatedAddress) {
              setSelectedAddress(
                newlyCreatedAddress
              );
            }

            setShowAddAddress(false);
          }}
        />
      </Modal>
    </div>
  );
}