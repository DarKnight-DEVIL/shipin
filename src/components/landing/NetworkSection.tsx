"use client";

import type { Corridor } from "./types";

export interface NetworkSectionProps {
  corridors: Corridor[];
}

export default function NetworkSection({ corridors }: NetworkSectionProps) {
  return (
    <section className="network" id="network">
      <div className="shell">
        <div className="section-head section-head--dark">
          <div>
            <p className="eyebrow">02 / Live network</p>
            <h2>The route is visible while it happens.</h2>
          </div>
          <p className="lede">
            Every request gets a manifest ID and an event log. Watch the
            parcel move from the seller&apos;s counter to your address without
            emailing an account manager for an update.
          </p>
        </div>

        <div className="network__grid">
          <div className="corridors">
            <table className="corridors__table">
              <caption className="sr-only">
                Active shipping corridors from Mumbai
              </caption>
              <thead>
                <tr>
                  <th scope="col">Corridor</th>
                  <th scope="col">Transit</th>
                  <th scope="col">Cut off</th>
                </tr>
              </thead>
              <tbody>
                {corridors.map((corridor) => (
                  <tr key={corridor.route}>
                    <th scope="row" className="corridors__route">
                      {corridor.route}
                    </th>
                    <td>{corridor.transit}</td>
                    <td className="corridors__cutoff">{corridor.cutoff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="corridors__note">
              Transit excludes customs holds. Freight is quoted per
              consolidated manifest, not per parcel.
            </p>
          </div>

          <div className="telemetry">
            <div className="telemetry__head">
              <div>
                <span className="micro-label">Manifest</span>
                <strong className="telemetry__id">SH-2048</strong>
              </div>
              <span className="chip chip--rust">In transit</span>
            </div>

            <div className="telemetry__route">
              <div>
                <span className="micro-label">From</span>
                <strong>Mumbai</strong>
              </div>
              <span className="telemetry__arrow" aria-hidden="true">
                →
              </span>
              <div>
                <span className="micro-label">To</span>
                <strong>Berlin</strong>
              </div>
              <span className="telemetry__eta">ETA 20 Oct</span>
            </div>

            <ol className="timeline">
              <li className="timeline__item timeline__item--done">
                <span className="timeline__dot" aria-hidden="true" />
                <div>
                  <p className="timeline__title">Seller pickup</p>
                  <p className="timeline__meta">12 Oct, 09:40 · Jaipur</p>
                </div>
              </li>
              <li className="timeline__item timeline__item--done">
                <span className="timeline__dot" aria-hidden="true" />
                <div>
                  <p className="timeline__title">Checked at hub</p>
                  <p className="timeline__meta">14 Oct, 16:05 · Mumbai</p>
                  <p className="timeline__detail">
                    4 of 4 units matched. Photo set attached.
                  </p>
                </div>
              </li>
              <li className="timeline__item timeline__item--done">
                <span className="timeline__dot" aria-hidden="true" />
                <div>
                  <p className="timeline__title">Export cleared</p>
                  <p className="timeline__meta">15 Oct, 11:20 · Mumbai</p>
                </div>
              </li>
              <li className="timeline__item timeline__item--current">
                <span className="timeline__dot" aria-hidden="true" />
                <div>
                  <p className="timeline__title">In transit</p>
                  <p className="timeline__meta">17 Oct, 22:10 · Frankfurt</p>
                  <p className="timeline__detail">
                    Handed to the last mile partner. Duties prepaid.
                  </p>
                </div>
              </li>
              <li className="timeline__item timeline__item--next">
                <span className="timeline__dot" aria-hidden="true" />
                <div>
                  <p className="timeline__title">Delivery</p>
                  <p className="timeline__meta">Expected 20 Oct · Berlin</p>
                </div>
              </li>
            </ol>

            <p className="telemetry__foot">
              <span>Sample manifest</span>
              <span>Updated 12s ago</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}