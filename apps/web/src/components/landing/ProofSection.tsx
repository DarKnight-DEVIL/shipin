"use client";

import type { Metric } from "./types";

export interface ProofSectionProps {
  metrics: Metric[];
}

export default function ProofSection({ metrics }: ProofSectionProps) {
  return (
    <section className="proof">
      <div className="shell proof__inner">
        <div className="proof__statement">
          <p className="eyebrow">Track record</p>
          <h2>One accountable partner, from checkout to customs.</h2>
          <p>
            Most cross border orders fail in the handoffs. ShipIN keeps
            purchasing, warehousing, export filing and delivery inside one
            operating team, so a missing parcel has one place to go.
          </p>
        </div>

        <div className="proof__grid">
          {metrics.map((metric) => (
            <div className="metric" key={metric.label}>
              <span className="metric__value">{metric.value}</span>
              <span className="metric__label">{metric.label}</span>
              <p className="metric__detail">{metric.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}