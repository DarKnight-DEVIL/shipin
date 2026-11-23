"use client";

import { steps } from "./content";

export default function PipelineSection() {
  return (
    <section className="section" id="platform">
      <div className="shell">
        <div className="section-head">
          <div>
            <p className="eyebrow">01 / The pipeline</p>
            <h2>One request. Four checkpoints.</h2>
          </div>
          <p className="lede">
            You do not need a seller, a freight desk and a customs broker on
            separate threads. The same team owns the parcel from checkout to
            doorstep.
          </p>
        </div>

        <ol className="steps">
          {steps.map((step) => (
            <li className="step" key={step.number}>
              <span className="step__number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <span className="step__meta">{step.meta}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
