"use client";

import type { Plan } from "./types";

export interface PricingSectionProps {
  plans: Plan[];
}

export default function PricingSection({ plans }: PricingSectionProps) {
  return (
    <section className="section pricing" id="pricing">
      <div className="shell">
        <div className="section-head">
          <div>
            <p className="eyebrow">03 / Access</p>
            <h2>Pricing that follows the work.</h2>
          </div>
          <p className="lede">
            No subscription. Pay per request for small batches, or move to
            freight rates once volume justifies a lane.
          </p>
        </div>

        <div className="pricing__grid">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className={plan.featured ? "plan plan--featured" : "plan"}
            >
              <div className="plan__head">
                <span className="plan__code">{plan.code}</span>
                {plan.featured && (
                  <span className="chip chip--outline">Most chosen</span>
                )}
              </div>
              <h3 className="plan__name">{plan.name}</h3>
              <p className="plan__price">
                {plan.price}
                <span>{plan.unit}</span>
              </p>
              <p className="plan__description">{plan.description}</p>

              <ul className="plan__features">
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <span className="plan__check" aria-hidden="true">
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

              <button
                type="button"
                className={
                  plan.featured
                    ? "btn btn--accent plan__cta"
                    : "btn btn--ghost plan__cta"
                }
                onClick={() => {
                  // onClick handled by parent
                }}
              >
                {plan.cta}
              </button>
            </article>
          ))}
        </div>

        <div className="pricing__note">
          <span>Duties, taxes and freight are quoted before you approve.</span>
          <span>Cancel free before procurement starts.</span>
        </div>
      </div>
    </section>
  );
}