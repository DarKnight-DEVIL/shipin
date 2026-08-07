"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import ActionButton from "@/components/ui/ActionButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { RequestStatus } from "@/lib/requestStatus";

interface Props {
  requestId: string;
  status: RequestStatus;
}

interface ActionConfig {
  title: string;
  button?: string;
  nextStatus?: RequestStatus;
}

export default function NextActionCard({
  requestId,
  status,
}: Props) {
  const [updating, setUpdating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  /*
   * ADMIN WORKFLOW
   *
   * IMPORTANT:
   * Payment-controlled statuses are NOT
   * manually advanced from this component.
   */
  const actions: Partial<
    Record<RequestStatus, ActionConfig>
  > = {
    submitted: {
      title: "Generate Quote",
    },

    review: {
      title:
        "Waiting for customer to accept the quote.",
    },

    awaiting_payment: {
      title:
        "Waiting for customer payment. This status will update automatically after successful payment.",
    },

    paid: {
      title: "Purchase Items",
      button: "Mark Purchased",
      nextStatus: "purchased",
    },

    purchased: {
      title:
        "Waiting for the purchased items to arrive at the warehouse.",
    },

    warehouse_received: {
      title: "Prepare and pack the shipment.",
      button: "Mark Packed",
      nextStatus: "packed",
    },

    ready_for_international_shipping: {
      title:
        "Package is ready for international shipping.",
      button: "Mark Packed",
      nextStatus: "packed",
    },

    packed: {
      title:
        "Create the shipment and add tracking information.",
    },

    shipped: {
      title:
        "Shipment is in transit. Waiting for delivery.",
    },

    out_for_delivery: {
      title:
        "Shipment is out for delivery.",
    },

    delivered: {
      title:
        "Shipment delivered. Support window is active.",
    },

    refunded: {
      title: "Request refunded.",
    },
  };

  const action = actions[status];

  async function changeStatus() {
    if (
      !action?.nextStatus ||
      updating
    ) {
      return;
    }

    /*
     * Extra protection:
     *
     * Never allow this button to manually
     * change awaiting_payment → paid.
     *
     * The PayPal capture API owns that
     * transition.
     */
    if (
      status === "awaiting_payment"
    ) {
      return;
    }

    try {
      setUpdating(true);

      const requestRef = doc(
        db,
        "requests",
        requestId
      );

      await updateDoc(
        requestRef,
        {
          status:
            action.nextStatus,

          /*
           * Record when this status
           * was reached.
           */
          [`statusHistory.${action.nextStatus}`]:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      /*
       * No reload needed.
       *
       * Your admin page should receive
       * the Firestore update through
       * its live listener.
       */
    } catch (error) {
      console.error(
        "Failed to update request status:",
        error
      );

      alert(
        "Unable to update the request status."
      );
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <h2 className="text-xl font-bold text-white">
        Next Action
      </h2>

      <p className="text-slate-400 mt-4">
        {action?.title ??
          "No action available for this status."}
      </p>

      {action?.button &&
        action.nextStatus && (
          <ActionButton
            className="mt-6 w-full"
            onClick={() => setConfirmOpen(true)}
            loading={
              updating
            }
          >
            {action.button}
          </ActionButton>
        )}

      {action && (
        <ConfirmDialog
          open={confirmOpen}
          title="Change Request Status"
          message={`Change request status from "${status}" to "${action.nextStatus}"?`}
          confirmText="Update Status"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={async () => {
            setConfirmOpen(false);
            await changeStatus();
          }}
        />
      )}

    </div>
  );
}