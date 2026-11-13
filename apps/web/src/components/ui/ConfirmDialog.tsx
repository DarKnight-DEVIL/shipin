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
    <Modal open={open} title="" onClose={onCancel}>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              danger
                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                : "bg-[var(--surface-2)] text-[var(--muted)]"
            }`}
          >
            {danger ? (
              <AlertTriangle size={17} />
            ) : (
              <CheckCircle2 size={17} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
              {title}
            </h2>

            <p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">
              {message}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="app-btn app-btn-secondary"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`app-btn ${danger ? "app-btn-danger" : "app-btn-primary"}`}
          >
            {loading ? "Please wait…" : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
