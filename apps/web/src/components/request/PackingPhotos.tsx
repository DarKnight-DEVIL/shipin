"use client";

import Image from "next/image";

// Every image here is a presigned R2 URL (per-account host, 15-minute
// signature), so each <Image> bypasses the optimizer via `unoptimized`:
// /_next/image cannot cache a signature and would expose it in our URL.

interface Props {
  beforePacking?: string[];

  afterPacking?: string[];

  shippingLabel?: string;
}

export default function PackingPhotos({
  beforePacking = [],
  afterPacking = [],
  shippingLabel,
}: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <h2 className="text-2xl font-semibold text-white mb-6">
        Packing Photos
      </h2>

      <div className="space-y-8">

        <section>

          <h3 className="text-lg font-semibold text-white mb-4">
            Before Packing
          </h3>

          <div className="grid md:grid-cols-3 gap-4">
            {beforePacking.map((img) => (
              <Image
                key={img}
                src={img}
                unoptimized
                width={300}
                height={200}
                className="rounded-xl border border-slate-700"
                alt="Before packing photo"
              />
            ))}
          </div>

        </section>

        <section>

          <h3 className="text-lg font-semibold text-white mb-4">
            After Packing
          </h3>

          <div className="grid md:grid-cols-3 gap-4">
            {afterPacking.map((img) => (
              <Image
                key={img}
                src={img}
                unoptimized
                width={300}
                height={200}
                className="rounded-xl border border-slate-700"
                alt="After packing photo"
              />
            ))}
          </div>

        </section>

        {shippingLabel && (
          <section>

            <h3 className="text-lg font-semibold text-white mb-4">
              Shipping Label
            </h3>

            <Image
              src={shippingLabel}
              unoptimized
              width={300}
              height={400}
              className="rounded-xl border border-slate-700 max-w-sm"
              alt="Shipping label"
            />

          </section>
        )}

      </div>

    </div>
  );
}