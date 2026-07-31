"use client";

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
              <img
                key={img}
                src={img}
                className="rounded-xl border border-slate-700"
                alt=""
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
              <img
                key={img}
                src={img}
                className="rounded-xl border border-slate-700"
                alt=""
              />
            ))}
          </div>

        </section>

        {shippingLabel && (
          <section>

            <h3 className="text-lg font-semibold text-white mb-4">
              Shipping Label
            </h3>

            <img
              src={shippingLabel}
              className="rounded-xl border border-slate-700 max-w-sm"
              alt=""
            />

          </section>
        )}

      </div>

    </div>
  );
}