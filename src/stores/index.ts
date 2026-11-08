/**
 * @fileoverview ShipIN shared client store (Zustand).
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
