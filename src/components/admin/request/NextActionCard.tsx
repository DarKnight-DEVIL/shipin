"use client";

import ActionButton from "@/components/ui/ActionButton";

interface Props {
  status: string;
}

export default function NextActionCard({
  status,
}: Props) {

  const actions: Record<
    string,
    {
      title: string;
      button?: string;
    }
  > = {

    submitted: {
      title: "Generate Quote",
      button: "Create Quote",
    },

    payment: {
      title:
        "Waiting for customer payment",
    },

    paid: {
      title: "Purchase Items",
      button: "Mark Purchased",
    },

    purchased: {
      title:
        "Waiting for warehouse arrival",
    },

    warehouse_received: {
      title: "Pack Shipment",
      button: "Mark Packed",
    },

    packed: {
      title: "Create Shipment",
      button: "Create Shipment",
    },

    shipped: {
      title:
        "Waiting for delivery",
    },

    delivered: {
      title:
        "Support Window Active",
    },

    refunded: {
      title:
        "Request Completed",
    },

  };

  const action =
    actions[status];

  return (

    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <h2 className="text-xl font-bold text-white">

        Next Action

      </h2>

      <p className="text-slate-400 mt-4">

        {action?.title}

      </p>

      {action?.button && (

        <ActionButton
          className="mt-6 w-full"
        >

          {action.button}

        </ActionButton>

      )}

    </div>

  );

}