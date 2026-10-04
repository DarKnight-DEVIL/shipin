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

export default function Modal({
  open,
  title,
  onClose,
  children,
}: Props) {
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
      className="
        fixed inset-0 z-[100]
        flex items-center justify-center
        p-4 sm:p-6
        bg-slate-950/60
        backdrop-blur-sm
      "
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
        className="
          relative w-full max-w-lg
          max-h-[90vh]
          overflow-y-auto
          rounded-3xl
          border border-slate-200
          bg-white
          shadow-2xl
          shadow-black/20

          dark:border-slate-800
          dark:bg-slate-950
          dark:shadow-black/50
        "
        onMouseDown={(event) => event.stopPropagation()}
      >
        {title ? (
          <div
            className="
              flex items-center justify-between
              border-b border-slate-200
              px-6 py-5

              dark:border-slate-800
            "
          >
            <h2
              id="modal-title"
              className="
                text-lg font-bold
                text-slate-950
                dark:text-white
              "
            >
              {title}
            </h2>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="
                flex h-9 w-9
                items-center justify-center
                rounded-xl
                text-slate-500
                transition

                hover:bg-slate-100
                hover:text-slate-950

                dark:text-slate-400
                dark:hover:bg-slate-800
                dark:hover:text-white

                focus:outline-none
                focus:ring-2
                focus:ring-blue-500/40
              "
            >
              <X size={19} />
            </button>
          </div>
        ) : null}

        <div className="p-6 sm:p-7">{children}</div>
      </div>
    </div>,
    document.body
  );
}