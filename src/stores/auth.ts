// ============================================
// AUTH STORE
// Frozen contract v2 — single Seone auth coordinator
//
// INVARIANT: Only this store may persist or clear token/user state.
// INVARIANT: Only /auth/me determines session validity.
// ============================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, BackendAuthError } from '@/types';
import type { AuthLoginWireResponse } from '@/types';
import {
  fetchMe,
  mapWireUserToUser,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
} from '@/services/auth';

const LOG_PREFIX = '[AUTH:store]';

interface AuthStore {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: BackendAuthError | null;
  verificationFailure: 'network_error' | 'server_error' | null;

  // Actions (frozen contract)
  initialize: () => Promise<void>;
  loginWithBackendResponse: (response: AuthLoginWireResponse) => void;
  onAuthSuspicion: () => Promise<void>;
  logout: () => void;

  // Internal — exposed for testing only
  _revalidationPromise: Promise<void> | null;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: true,
      authError: null,
      verificationFailure: null,
      _revalidationPromise: null,

      // ============================================
      // INITIALIZE — Bootstrap on app load / page reload
      //
      // Contract:
      //   no token → anonymous
      //   token + /me 200 → authenticated (user from response)
      //   token + /me 401 → clear session, set authError
      //   token + /me network/5xx → keep session alive, set verificationFailure
      // ============================================
      initialize: async () => {
        const token = getAuthToken();

        if (!token) {
          console.info(`${LOG_PREFIX} initialize: no token → anonymous`);
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            authError: null,
            verificationFailure: null,
          });
          return;
        }

        console.info(`${LOG_PREFIX} initialize: token found, calling /auth/me`);
        set({ isLoading: true });

        const result = await fetchMe(token);

        if (result.ok) {
          const user = mapWireUserToUser(result.user);
          console.info(
            `${LOG_PREFIX} initialize: /me success → authenticated. user_id=${user.id} email=${user.email}`
          );
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            authError: null,
            verificationFailure: null,
          });
          return;
        }

        // Failure — distinguish auth failure from verification failure
        if (
          result.error === 'token_missing' ||
          result.error === 'token_expired' ||
          result.error === 'token_invalid' ||
          result.error === 'user_not_found'
        ) {
          // Backend confirmed: session is invalid
          console.warn(
            `${LOG_PREFIX} initialize: /me 401 (${result.error}) → clearing session. detail=${result.detail}`
          );
          clearAuthToken();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            authError: result.error as BackendAuthError,
            verificationFailure: null,
          });
          return;
        }

        // Network or server error — keep session alive
        // "Network is down" is NOT "session is invalid"
        const currentState = get();
        console.warn(
          `${LOG_PREFIX} initialize: /me unreachable (${result.error}) → keeping session alive. detail=${result.detail}`
        );
        set({
          // Keep existing user from localStorage cache if available
          user: currentState.user,
          isAuthenticated: !!currentState.user,
          isLoading: false,
          authError: null,
          verificationFailure: result.error as 'network_error' | 'server_error',
        });
      },

      // ============================================
      // LOGIN — After successful Google login exchange
      // ============================================
      loginWithBackendResponse: (response: AuthLoginWireResponse) => {
        const user = mapWireUserToUser(response.user);

        console.info(
          `${LOG_PREFIX} loginWithBackendResponse: setting session. user_id=${user.id} email=${user.email} expires_in=${response.expires_in}s`
        );

        // Store token in cookie with correct TTL from backend
        setAuthToken(response.access_token, response.expires_in);

        // Set user and auth state
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          authError: null,
          verificationFailure: null,
        });
      },

      // ============================================
      // AUTH SUSPICION — Single-flight revalidation
      //
      // Called by authFetch on 401 from any endpoint.
      // Calls /auth/me ONCE, regardless of how many callers triggered suspicion.
      //   /me 200 → 401 was non-auth, no session change
      //   /me 401 → clear session
      //   /me unreachable → no session change
      // ============================================
      onAuthSuspicion: async () => {
        const state = get();

        // Single-flight: if already revalidating, return existing promise
        if (state._revalidationPromise) {
          console.info(
            `${LOG_PREFIX} onAuthSuspicion: revalidation already in-flight, joining existing`
          );
          return state._revalidationPromise;
        }

        const doRevalidation = async () => {
          const token = getAuthToken();
          if (!token) {
            console.warn(`${LOG_PREFIX} onAuthSuspicion: no token → clearing session`);
            set({
              user: null,
              isAuthenticated: false,
              authError: 'token_missing',
              verificationFailure: null,
              _revalidationPromise: null,
            });
            return;
          }

          console.info(
            `${LOG_PREFIX} onAuthSuspicion: calling /auth/me to verify session`
          );
          const result = await fetchMe(token);

          if (result.ok) {
            // Session is still valid — 401 was from a non-auth cause
            const user = mapWireUserToUser(result.user);
            console.info(
              `${LOG_PREFIX} onAuthSuspicion: /me valid — session intact. user_id=${user.id}`
            );
            set({
              user,
              isAuthenticated: true,
              authError: null,
              verificationFailure: null,
              _revalidationPromise: null,
            });
            return;
          }

          if (
            result.error === 'token_missing' ||
            result.error === 'token_expired' ||
            result.error === 'token_invalid' ||
            result.error === 'user_not_found'
          ) {
            // Backend confirmed: session is dead
            console.warn(
              `${LOG_PREFIX} onAuthSuspicion: /me confirmed invalid (${result.error}) → clearing session`
            );
            clearAuthToken();
            set({
              user: null,
              isAuthenticated: false,
              authError: result.error as BackendAuthError,
              verificationFailure: null,
              _revalidationPromise: null,
            });

            // Redirect to login — session is confirmed dead
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
            return;
          }

          // Network/server error — keep session alive
          console.warn(
            `${LOG_PREFIX} onAuthSuspicion: /me unreachable (${result.error}) — keeping session alive`
          );
          set({
            verificationFailure: result.error as 'network_error' | 'server_error',
            _revalidationPromise: null,
          });
        };

        const promise = doRevalidation();
        set({ _revalidationPromise: promise });
        return promise;
      },

      // ============================================
      // LOGOUT — Local session forgetting only
      // No backend call (no /auth/logout endpoint).
      // ============================================
      logout: () => {
        console.info(`${LOG_PREFIX} logout: clearing local session`);
        clearAuthToken();
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          authError: null,
          verificationFailure: null,
          _revalidationPromise: null,
        });
      },
    }),
    {
      name: 'seone-auth',
      storage: createJSONStorage(() => localStorage),
      // Persist user + isAuthenticated as display cache only.
      // /auth/me is the real truth source on bootstrap.
      partialize: state => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
