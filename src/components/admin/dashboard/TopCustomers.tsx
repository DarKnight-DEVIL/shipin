"use client";

interface Customer {
  id: string;
  name: string;
  email: string;
  requests: number;
  revenue: number;
}

interface Props {
  customers: Customer[];
}

export default function TopCustomers({
  customers,
}: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <h2 className="text-2xl font-bold text-white mb-6">
        Top Customers
      </h2>

      <div className="overflow-x-auto">

        <table className="w-full">

          <thead>

            <tr className="text-left border-b border-slate-800">

              <th className="pb-3 text-slate-400">
                Customer
              </th>

              <th className="pb-3 text-slate-400">
                Requests
              </th>

              <th className="pb-3 text-slate-400">
                Revenue
              </th>

            </tr>

          </thead>

          <tbody>

            {customers.map((customer) => (

              <tr
                key={customer.id}
                className="border-b border-slate-800"
              >

                <td className="py-4">

                  <div>

                    <p className="text-white font-semibold">
                      {customer.name}
                    </p>

                    <p className="text-slate-500 text-sm">
                      {customer.email}
                    </p>

                  </div>

                </td>

                <td className="text-white">
                  {customer.requests}
                </td>

                <td className="text-green-400 font-semibold">
                  ${customer.revenue.toFixed(2)}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}