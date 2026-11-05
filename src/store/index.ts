import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import requestsReducer from './slices/requestsSlice';
import notificationsReducer from './slices/notificationsSlice';
import supportReducer from './slices/supportSlice';
import walletReducer from './slices/walletSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    requests: requestsReducer,
    notifications: notificationsReducer,
    support: supportReducer,
    wallet: walletReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;