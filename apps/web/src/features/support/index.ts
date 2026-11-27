/**
 * @fileoverview Support feature – barrel export.
 */

export type { SupportTicket, SupportMessage } from "./types";

export {
  createSupportTicket,
  addSupportMessage,
  resolveSupportTicket,
  markSupportTicketRead,
  getSupportTicketsByRequest,
  getSupportTicketsByCustomer,
  getSupportMessages,
  subscribeToSupportMessages,
  subscribeToSupportTickets,
  subscribeToCustomerSupportTickets,
  subscribeToAllSupportTickets,
} from "./client/index";

export { canCreateSupportTicket } from "./services/supportRules";
