import { REQUEST_STATUS } from "./requestStatus";

export const statusColors = {
  [REQUEST_STATUS.submitted]:
    "bg-blue-500/10 text-blue-400 border-blue-500/20",

  [REQUEST_STATUS.review]:
    "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",

  [REQUEST_STATUS.awaiting_payment]:
    "bg-amber-500/10 text-amber-400 border-amber-500/20",

  [REQUEST_STATUS.paid]:
    "bg-green-500/10 text-green-400 border-green-500/20",

  [REQUEST_STATUS.purchased]:
    "bg-purple-500/10 text-purple-400 border-purple-500/20",

  [REQUEST_STATUS.warehouse_received]:
    "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",

  [REQUEST_STATUS.ready_for_international_shipping]:
    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",

  [REQUEST_STATUS.packed]:
    "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",

  [REQUEST_STATUS.shipped]:
    "bg-sky-500/10 text-sky-400 border-sky-500/20",

  [REQUEST_STATUS.out_for_delivery]:
    "bg-pink-500/10 text-pink-400 border-pink-500/20",

  [REQUEST_STATUS.delivered]:
    "bg-lime-500/10 text-lime-400 border-lime-500/20",

  [REQUEST_STATUS.refunded]:
    "bg-red-500/10 text-red-400 border-red-500/20",
};