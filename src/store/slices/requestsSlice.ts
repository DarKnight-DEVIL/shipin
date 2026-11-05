import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Request } from '@/features/requests/types';

interface RequestsState {
  requests: Request[];
  selectedRequest: Request | null;
  loading: boolean;
  error: string | null;
}

const initialState: RequestsState = {
  requests: [],
  selectedRequest: null,
  loading: false,
  error: null,
};

export const requestsSlice = createSlice({
  name: 'requests',
  initialState,
  reducers: {
    setRequests: (state, action: PayloadAction<Request[]>) => {
      state.requests = action.payload;
      state.loading = false;
    },
    setSelectedRequest: (state, action: PayloadAction<Request | null>) => {
      state.selectedRequest = action.payload;
    },
    updateRequest: (state, action: PayloadAction<Request>) => {
      const index = state.requests.findIndex(r => r.id === action.payload.id);
      if (index !== -1) {
        state.requests[index] = action.payload;
      }
      if (state.selectedRequest?.id === action.payload.id) {
        state.selectedRequest = action.payload;
      }
    },
    addRequest: (state, action: PayloadAction<Request>) => {
      state.requests.push(action.payload);
    },
    removeRequest: (state, action: PayloadAction<string>) => {
      state.requests = state.requests.filter(r => r.id !== action.payload);
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.loading = false;
    },
  },
});

export const {
  setRequests,
  setSelectedRequest,
  updateRequest,
  addRequest,
  removeRequest,
  setLoading,
  setError,
} = requestsSlice.actions;
export default requestsSlice.reducer;