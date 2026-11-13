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

  const canCreate =
    subject.trim().length > 0 &&
    message.trim().length > 0;

  function handleCreate() {
    if (!canCreate) return;

    onCreate(
      category,
      subject.trim(),
      message.trim()
    );

    setSubject("");
    setMessage("");
    setCategory("Shipment");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">

      {/* MODAL */}
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">

        {/* HEADER */}
        <div className="mb-6">

          <h2 className="text-2xl font-bold text-slate-950 dark:text-white">
            New Support Ticket
          </h2>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tell us what you need help with.
          </p>

        </div>

        <div className="space-y-5">

          {/* CATEGORY */}
          <div>

            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Category
            </label>

            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value)
              }
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {categories.map(
                (category) => (
                  <option
                    key={category}
                    value={category}
                  >
                    {category}
                  </option>
                )
              )}
            </select>

          </div>

          {/* SUBJECT */}
          <div>

            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Subject
            </label>

            <input
              type="text"
              placeholder="Briefly describe the issue"
              value={subject}
              onChange={(e) =>
                setSubject(e.target.value)
              }
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
            />

          </div>

          {/* MESSAGE */}
          <div>

            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Message
            </label>

            <textarea
              rows={6}
              placeholder="Describe your issue..."
              value={message}
              onChange={(e) =>
                setMessage(e.target.value)
              }
              className="w-full resize-none rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
            />

          </div>

          {/* ACTIONS */}
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCreate}
              disabled={!canCreate}
              className="rounded-xl bg-purple-600 px-5 py-2.5 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create Ticket
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}