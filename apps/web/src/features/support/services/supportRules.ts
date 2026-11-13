const SUPPORT_WINDOW_HOURS = 72;

export function canCreateSupportTicket(request: import("@/types/request").Request) {
  // Refunded requests can never create new tickets
  if (request.status === "refunded") {
    return false;
  }

  // Before delivery, always allow
  if (request.status !== "delivered") {
    return true;
  }

  // No delivery timestamp? Allow
  const deliveredTimestamp = request.statusHistory?.delivered;
  if (!deliveredTimestamp) {
    return true;
  }

  const delivered =
    deliveredTimestamp.toDate();

  const expires =
    delivered.getTime() +
    SUPPORT_WINDOW_HOURS * 60 * 60 * 1000;

  return Date.now() < expires;
}