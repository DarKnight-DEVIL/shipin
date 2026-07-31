"use client";

interface Props {
  stats: {
    grossRevenue: number;
    serviceFees: number;
    productCost: number;
    shippingCost: number;
    averageOrderValue: number;
    paidOrders: number;
  };
}

export default function FinancialOverview({
  stats,
}: Props) {
  const cards = [
    {
      title: "Gross Revenue",
      value: `$${stats.grossRevenue.toFixed(2)}`,
      color: "text-green-400",
    },
    {
      title: "Service Fees",
      value: `$${stats.serviceFees.toFixed(2)}`,
      color: "text-purple-400",
    },
    {
      title: "Product Cost",
      value: `$${stats.productCost.toFixed(2)}`,
      color: "text-orange-400",
    },
    {
      title: "Shipping Cost",
      value: `$${stats.shippingCost.toFixed(2)}`,
      color: "text-blue-400",
    },
    {
      title: "Average Order",
      value: `$${stats.averageOrderValue.toFixed(2)}`,
      color: "text-cyan-400",
    },
    {
      title: "Paid Orders",
      value: stats.paidOrders,
      color: "text-yellow-400",
    },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <h2 className="text-2xl font-bold text-white mb-6">
        Financial Overview
      </h2>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">

        {cards.map((card) => (
          <div
            key={card.title}
            className="bg-slate-950 border border-slate-800 rounded-xl p-5"
          >
            <p className="text-slate-400">
              {card.title}
            </p>

            <h3
              className={`text-3xl font-bold mt-3 ${card.color}`}
            >
              {card.value}
            </h3>
          </div>
        ))}

      </div>

    </div>
  );
}