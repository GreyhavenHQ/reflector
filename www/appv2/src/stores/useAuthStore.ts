/**
 * Auth store — simplified to hold only client-side state.
 * Real auth logic lives in AuthProvider (communicates with Express proxy).
 * This store is mainly used for reactive UI updates and persisting a
 * flag for the RequireAuth guard during initial load.
 */

import { create } from "zustand";

interface AuthUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setAuth: (user: AuthUser) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  setAuth: (user) => set({ user, isAuthenticated: true }),
  clearAuth: () => set({ user: null, isAuthenticated: false }),
}));
