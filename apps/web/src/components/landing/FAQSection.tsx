"use client";

import { useState } from "react";
import type { FAQItem } from "@/config/landing";

interface FAQSectionProps {
  items: FAQItem[];
}

export default function FAQSection({ items }: FAQSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="faq" id="faq" aria-labelledby="faq-title">
      <div className="shell">
        <div className="section-head">
          <p className="eyebrow">04 / Details</p>
          <h2 id="faq-title">Still have questions?</h2>
        </div>

        <dl className="faq__list">
          {items.map((item, index) => (
            <div key={index} className="faq__item">
              <button
                type="button"
                className={`faq__question ${openIndex === index ? "open" : ""}`}
                onClick={() =>
                  setOpenIndex(openIndex === index ? null : index)
                }
                aria-expanded={openIndex === index}
                aria-controls={`faq-answer-${index}`}
              >
                <span>{item.question}</span>
                <svg
                  className="faq__icon"
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
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </button>
              <dd
                id={`faq-answer-${index}`}
                className="faq__answer"
                hidden={openIndex !== index}
              >
                <p>{item.answer}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}