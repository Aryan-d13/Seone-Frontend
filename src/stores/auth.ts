// ============================================
// AUTH STORE
// Zustand store for authentication state
// ============================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, AuthState } from '@/types';
import { getCurrentUser, logout as logoutService, getAuthToken } from '@/services/auth';

interface AuthStore extends AuthState {
  // Actions
  setUser: (user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
  initialize: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: true,

      // Set user
      setUser: user => {
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
        });
      },

      // Set loading state
      setLoading: isLoading => {
        set({ isLoading });
      },

      // Initialize auth state on app load
      // Skip /me API call - rely on persisted state from sessionStorage
      initialize: async () => {
        const token = getAuthToken();
        const currentState = get();

        // If we have a token and persisted user, consider authenticated
        if (token && currentState.user) {
          set({ isLoading: false, isAuthenticated: true });
          return;
        }

        // No token = not authenticated
        if (!token) {
          set({ user: null, isAuthenticated: false, isLoading: false });
          return;
        }

        // Token exists but no user in state - clear token (inconsistent state)
        set({ user: null, isAuthenticated: false, isLoading: false });
      },

      // Logout
      logout: async () => {
        set({ isLoading: true });
        await logoutService();
        set({ user: null, isAuthenticated: false, isLoading: false });
      },
    }),
    {
      name: 'seone-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: state => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
