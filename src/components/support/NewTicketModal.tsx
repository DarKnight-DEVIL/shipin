"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (
    category: string,
    subject: string,
    message: string
  ) => void;
}

const categories = [
  "Shipment",
  "Tracking",
  "Payment",
  "Refund",
  "Customs",
  "Missing Item",
  "Wrong Item",
  "Other",
];

export default function NewTicketModal({
  open,
  onClose,
  onCreate,
}: Props) {
  const [category, setCategory] =
    useState("Shipment");

  const [subject, setSubject] =
    useState("");

  const [message, setMessage] =
    useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">

      <div className="bg-slate-900 rounded-2xl p-6 w-full max-w-xl">

        <h2 className="text-2xl font-bold text-white mb-6">
          New Support Ticket
        </h2>

        <div className="space-y-4">

          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value)
            }
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3"
          >
            {categories.map((category) => (
              <option
                key={category}
                value={category}
              >
                {category}
              </option>
            ))}
          </select>

          <input
            placeholder="Subject"
            value={subject}
            onChange={(e) =>
              setSubject(e.target.value)
            }
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3"
          />

          <textarea
            rows={6}
            placeholder="Describe your issue..."
            value={message}
            onChange={(e) =>
              setMessage(e.target.value)
            }
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3"
          />

          <div className="flex justify-end gap-3">

            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-800"
            >
              Cancel
            </button>

            <button
              onClick={() => {
                onCreate(
                  category,
                  subject,
                  message
                );

                setSubject("");
                setMessage("");
                setCategory("Shipment");
              }}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700"
            >
              Create Ticket
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}