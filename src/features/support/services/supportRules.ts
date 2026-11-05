const SUPPORT_WINDOW_HOURS = 72;

export function canCreateSupportTicket(request: any) {
  // Refunded requests can never create new tickets
  if (request.status === "refunded") {
    return false;
  }

  // Before delivery, always allow
  if (request.status !== "delivered") {
    return true;
  }

  // No delivery timestamp? Allow
  if (!request.deliveredAt) {
    return true;
  }

  const delivered =
    request.deliveredAt.toDate();

  const expires =
    delivered.getTime() +
    SUPPORT_WINDOW_HOURS * 60 * 60 * 1000;

  return Date.now() < expires;
}