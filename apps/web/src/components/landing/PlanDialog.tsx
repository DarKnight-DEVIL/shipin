"use client";

import { useEffect, useRef } from "react";
import type { Plan } from "@/config/landing";

interface PlanDialogProps {
  plan: Plan | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (planId: "standard" | "express" | "merchant") => void;
}

export default function PlanDialog({
  plan,
  isOpen,
  onClose,
  onSelect,
}: PlanDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      dialogRef.current?.focus();
      document.body.style.overflow = "hidden";

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || !plan) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="plan-dialog"
      role="presentation"
      onMouseDown={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="plan-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-dialog-title"
        tabIndex={-1}
      >
        <div className="plan-dialog__head">
          <div>
            <span className="micro-label">{plan.code}</span>
            <h2 id="plan-dialog-title" className="plan-dialog__title">
              {plan.name}
            </h2>
          </div>
          <button
            type="button"
            className="plan-dialog__close"
            onClick={onClose}
            aria-label="Close plan details"
          >
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </div>

        <p className="plan-dialog__price">
          {plan.price}
          <span>{plan.unit}</span>
        </p>
        <p className="plan-dialog__description">{plan.description}</p>

        <ul className="plan-dialog__features">
          {plan.features.map((feature) => (
            <li key={feature} className="plan-dialog__feature">
              <span className="plan-dialog__check" aria-hidden="true">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2.5 7.5l3 3 6-7" />
                </svg>
              </span>
              {feature}
            </li>
          ))}
        </ul>

        <div className="plan-dialog__actions">
          <button
            type="button"
            className={`plan-dialog__cta ${plan.featured ? "accent" : "ghost"}`}
            onClick={() => {
              onSelect(plan.id);
              onClose();
            }}
          >
            {plan.cta}
          </button>
          <button
            type="button"
            className="plan-dialog__cta ghost"
            onClick={onClose}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}