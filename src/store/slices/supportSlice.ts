import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SupportTicket, SupportMessage } from '@/features/support/types';

interface SupportState {
  tickets: SupportTicket[];
  selectedTicket: SupportTicket | null;
  messages: SupportMessage[];
  loading: boolean;
  error: string | null;
}

const initialState: SupportState = {
  tickets: [],
  selectedTicket: null,
  messages: [],
  loading: false,
  error: null,
};

export const supportSlice = createSlice({
  name: 'support',
  initialState,
  reducers: {
    setTickets: (state, action: PayloadAction<SupportTicket[]>) => {
      state.tickets = action.payload;
      state.loading = false;
    },
    setSelectedTicket: (state, action: PayloadAction<SupportTicket | null>) => {
      state.selectedTicket = action.payload;
    },
    setMessages: (state, action: PayloadAction<SupportMessage[]>) => {
      state.messages = action.payload;
    },
    addMessage: (state, action: PayloadAction<SupportMessage>) => {
      state.messages.push(action.payload);
    },
    updateTicketStatus: (
      state,
      action: PayloadAction<{ id: string; status: 'open' | 'resolved' }>
    ) => {
      const ticket = state.tickets.find(t => t.id === action.payload.id);
      if (ticket) {
        ticket.status = action.payload.status;
      }
      if (state.selectedTicket?.id === action.payload.id) {
        state.selectedTicket.status = action.payload.status;
      }
    },
    clearSupport: (state) => {
      state.tickets = [];
      state.selectedTicket = null;
      state.messages = [];
    },
  },
});

export const {
  setTickets,
  setSelectedTicket,
  setMessages,
  addMessage,
  updateTicketStatus,
  clearSupport,
} = supportSlice.actions;
export default supportSlice.reducer;