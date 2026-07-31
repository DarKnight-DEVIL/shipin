"use client";

interface Props {
  stats: {
    awaitingQuote: number;
    awaitingPayment: number;
    warehouse: number;
    readyToShip: number;
    shippedToday: number;
    overdue: number;
  };
}

export default function OperationsOverview({
  stats,
}: Props) {
  const cards = [
    {
      label: "Awaiting Quote",
      value: stats.awaitingQuote,
      color: "text-yellow-400",
    },
    {
      label: "Awaiting Payment",
      value: stats.awaitingPayment,
      color: "text-orange-400",
    },
    {
      label: "Warehouse Processing",
      value: stats.warehouse,
      color: "text-blue-400",
    },
    {
      label: "Ready To Ship",
      value: stats.readyToShip,
      color: "text-cyan-400",
    },
    {
      label: "Shipped Today",
      value: stats.shippedToday,
      color: "text-purple-400",
    },
    {
      label: "Overdue Packages",
      value: stats.overdue,
      color: "text-red-400",
    },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <h2 className="text-2xl font-bold text-white mb-6">
        Today's Operations
      </h2>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">

        {cards.map((card) => (

          <div
            key={card.label}
            className="rounded-xl border border-slate-800 bg-slate-950 p-5"
          >

            <p className="text-slate-400">
              {card.label}
            </p>

            <h3
              className={`text-4xl font-bold mt-3 ${card.color}`}
            >
              {card.value}
            </h3>

          </div>

        ))}

      </div>

    </div>
  );
}