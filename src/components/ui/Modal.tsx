"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ open, title, onClose, children }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[3px] sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      <div
        className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-[var(--border)] bg-[var(--card)] shadow-xl shadow-slate-950/20 dark:shadow-black/50"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {title ? (
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
            <h2
              id="modal-title"
              className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--foreground)]"
            >
              {title}
            </h2>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="app-iconbtn -mr-1.5"
            >
              <X size={17} />
            </button>
          </div>
        ) : null}

        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
