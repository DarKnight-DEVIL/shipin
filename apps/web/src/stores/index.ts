/**
 * @fileoverview ShipIN client store layer (Zustand).
 *
 * Provides lightweight, cross-page state that Firebase subscriptions alone
 * cannot cover efficiently — most notably a short-lived profile cache so that
 * navigating between Dashboard → Settings → Requests does not re-fetch the
 * user document from Firestore on every route change.
 *
 * This intentionally stays small. If a new piece of cross-page state is needed,
 * extend this module rather than introducing a new store file.
 */

import { create } from "zustand";
import type { UserProfile } from "@/features/users/services/userProfile";
import type { Request } from "@/types/request";

// ---------------------------------------------------------------------------
// User profile cache
// ---------------------------------------------------------------------------

interface ProfileState {
  profile: UserProfile | null;
  setProfile: (profile: UserProfile) => void;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,

  setProfile: (profile) => set({ profile }),
  clearProfile: () => set({ profile: null }),
}));

// ---------------------------------------------------------------------------
// UI state (modals, drawers, active tab panels, global loading)
// ---------------------------------------------------------------------------

interface UiState {
  /** Whether the admin MFA gate modal is open */
  mfaModalOpen: boolean;
  setMfaModalOpen: (open: boolean) => void;

  /** Currently selected dashboard view/tab */
  activeTab: string;
  setActiveTab: (tab: string) => void;

  /** Global loading overlay (e.g. during checkout payment flow) */
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  mfaModalOpen: false,
  setMfaModalOpen: (open) => set({ mfaModalOpen: open }),

  activeTab: "dashboard",
  setActiveTab: (tab) => set({ activeTab: tab }),

  loading: false,
  setLoading: (loading) => set({ loading }),
}));

// ---------------------------------------------------------------------------
// Notifications state (cross-page unread count, list cache)
// ---------------------------------------------------------------------------

interface NotificationsState {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  decrementUnread: () => void;
  markAllRead: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  unreadCount: 0,

  setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),
  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  decrementUnread: () => set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
  markAllRead: () => set({ unreadCount: 0 }),
}));

// ---------------------------------------------------------------------------
// Requests state (filters, selected request cache)
// ---------------------------------------------------------------------------

interface RequestsState {
  selectedRequest: Request | null;
  setSelectedRequest: (request: Request | null) => void;
  filters: Record<string, unknown>;
  setFilters: (filters: Record<string, unknown>) => void;
  clearFilters: () => void;
}

export const useRequestsStore = create<RequestsState>((set) => ({
  selectedRequest: null,
  setSelectedRequest: (request) => set({ selectedRequest: request }),
  filters: {},
  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
}));

// ---------------------------------------------------------------------------
// Wallet state (balance cache across pages)
// ---------------------------------------------------------------------------

interface WalletState {
  balance: number | null;
  currency: string;
  setBalance: (balance: number, currency?: string) => void;
  clearBalance: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  balance: null,
  currency: "USD",

  setBalance: (balance, currency = "USD") => set({ balance, currency }),
  clearBalance: () => set({ balance: null, currency: "USD" }),
}));
