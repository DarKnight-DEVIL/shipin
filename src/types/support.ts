export interface SupportMessage {
  id: string;
  sender: "customer" | "admin";
  message: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  requestId: string;
  customerId: string;
  category:
    | "Shipment"
    | "Tracking"
    | "Payment"
    | "Refund"
    | "Customs"
    | "Missing Item"
    | "Wrong Item"
    | "Other";
  subject: string;
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  messages: SupportMessage[];
}