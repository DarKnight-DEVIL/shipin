import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Wallet, WalletTransaction } from '@/features/wallet/types';

interface WalletState {
  balance: number;
  transactions: WalletTransaction[];
  loading: boolean;
  error: string | null;
}

const initialState: WalletState = {
  balance: 0,
  transactions: [],
  loading: false,
  error: null,
};

export const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    setBalance: (state, action: PayloadAction<number>) => {
      state.balance = action.payload;
    },
    setTransactions: (state, action: PayloadAction<WalletTransaction[]>) => {
      state.transactions = action.payload;
      state.loading = false;
    },
    addTransaction: (state, action: PayloadAction<WalletTransaction>) => {
      state.transactions.unshift(action.payload);
    },
    updateBalance: (state, action: PayloadAction<number>) => {
      state.balance = action.payload;
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
  setBalance,
  setTransactions,
  addTransaction,
  updateBalance,
  setLoading,
  setError,
} = walletSlice.actions;
export default walletSlice.reducer;