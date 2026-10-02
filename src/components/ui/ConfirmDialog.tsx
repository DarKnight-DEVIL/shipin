"use client";

import Modal from "@/components/ui/Modal";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      open={open}
      title=""
      onClose={onCancel}
    >
      <div className="space-y-6">
        {/* ICON + TITLE */}
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              danger
                ? "bg-red-500/10 text-red-500"
                : "bg-blue-500/10 text-blue-500"
            }`}
          >
            {danger ? (
              <AlertTriangle size={24} />
            ) : (
              <CheckCircle2 size={24} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">
              {title}
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
              {message}
            </p>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="
              rounded-xl border border-slate-200
              bg-white px-5 py-2.5
              font-medium text-slate-700
              transition
              hover:bg-slate-50
              disabled:cursor-not-allowed
              disabled:opacity-50

              dark:border-slate-700
              dark:bg-slate-900
              dark:text-slate-300
              dark:hover:bg-slate-800
            "
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`
              rounded-xl px-5 py-2.5
              font-semibold text-white
              shadow-sm transition
              disabled:cursor-not-allowed
              disabled:opacity-50
              ${
                danger
                  ? `
                    bg-red-600
                    hover:bg-red-700
                    focus:ring-2
                    focus:ring-red-500/30
                  `
                  : `
                    bg-blue-600
                    hover:bg-blue-700
                    focus:ring-2
                    focus:ring-blue-500/30
                  `
              }
            `}
          >
            {loading ? "Please wait..." : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}