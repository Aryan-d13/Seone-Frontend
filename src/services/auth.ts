// ============================================
// AUTH SERVICE
// Frozen contract v2 — auth boundary layer
//
// INVARIANT: Only /auth/me determines session validity.
// INVARIANT: Only the auth store may persist or clear session state.
// ============================================

import Cookies from 'js-cookie';
import { config, getApiUrl, endpoints } from '@/lib/config';
import type {
  User,
  AuthWireUser,
  AuthLoginWireResponse,
  AuthMeWireResponse,
  AuthErrorWireResponse,
  BackendAuthError,
} from '@/types';

const LOG_PREFIX = '[AUTH:service]';

// ============================================
// THE ONE MAPPER — Backend User → Frontend User
// No other file may construct a User from raw data.
// ============================================

/**
 * Map backend wire user to frontend User type.
 * Policy: null name → empty string for display.
 * Policy: role uses whitelist validation, not type assertion.
 */
export function mapWireUserToUser(wire: AuthWireUser): User {
  return {
    id: wire.id,
    email: wire.email,
    name: wire.name ?? '', // Policy: null → empty string
    role: wire.role === 'admin' ? 'admin' : 'user', // Whitelist, not cast
    // picture: undefined — backend doesn't store it. Honest absence.
  };
}

// ============================================
// API Functions
// ============================================

/**
 * Exchange Google ID token for Seone JWT.
 * Contract: Google credential in request body, not URL query param.
 * Returns raw wire response for the store to process.
 */
export async function exchangeGoogleToken(
  idToken: string
): Promise<AuthLoginWireResponse> {
  console.info(`${LOG_PREFIX} exchangeGoogleToken: initiating`);

  const response = await fetch(getApiUrl(endpoints.auth.google), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: idToken }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error(
      `${LOG_PREFIX} exchangeGoogleToken: failed status=${response.status} body=${errorText}`
    );
    throw new Error(`Authentication failed (${response.status}): ${errorText}`);
  }

  const data: AuthLoginWireResponse = await response.json();

  console.info(
    `${LOG_PREFIX} exchangeGoogleToken: success user_id=${data.user.id} email=${data.user.email} expires_in=${data.expires_in}s`
  );

  return data;
}

/**
 * Fetch /auth/me — session validation endpoint.
 * Returns { user } on success, or structured error on 401.
 *
 * This is the ONLY diagnostic auth endpoint.
 */
export async function fetchMe(
  token: string
): Promise<
  | { ok: true; user: AuthWireUser }
  | { ok: false; error: BackendAuthError; detail: string }
  | { ok: false; error: 'network_error' | 'server_error'; detail: string }
> {
  console.info(`${LOG_PREFIX} fetchMe: validating session`);

  try {
    const response = await fetch(getApiUrl(endpoints.auth.me), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const data: AuthMeWireResponse = await response.json();
      console.info(
        `${LOG_PREFIX} fetchMe: session valid. user_id=${data.user.id} email=${data.user.email}`
      );
      return { ok: true, user: data.user };
    }

    if (response.status === 401) {
      // Structured 401 from /auth/me
      try {
        const errorData: AuthErrorWireResponse = await response.json();
        console.warn(
          `${LOG_PREFIX} fetchMe: auth failure. error=${errorData.error} detail=${errorData.detail}`
        );
        return { ok: false, error: errorData.error, detail: errorData.detail };
      } catch {
        console.warn(
          `${LOG_PREFIX} fetchMe: 401 but could not parse structured error body`
        );
        return {
          ok: false,
          error: 'token_invalid',
          detail: 'Auth validation failed (unparseable 401)',
        };
      }
    }

    // 5xx or other non-auth error
    console.warn(`${LOG_PREFIX} fetchMe: server error status=${response.status}`);
    return {
      ok: false,
      error: 'server_error',
      detail: `Server returned ${response.status}`,
    };
  } catch (err) {
    // Network error — /auth/me unreachable
    console.warn(`${LOG_PREFIX} fetchMe: network error`, err);
    return {
      ok: false,
      error: 'network_error',
      detail: err instanceof Error ? err.message : 'Network request failed',
    };
  }
}

// ============================================
// Token Management
// ============================================

/**
 * Store JWT token in cookie.
 * Cookie TTL matches backend token lifetime exactly.
 */
export function setAuthToken(token: string, expiresInSeconds: number): void {
  const expires = expiresInSeconds / 86400; // Convert seconds to days
  console.info(
    `${LOG_PREFIX} setAuthToken: storing token, expires_in=${expiresInSeconds}s (${expires.toFixed(2)} days)`
  );

  Cookies.set(config.auth.tokenCookieName, token, {
    expires,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
}

/**
 * Get JWT token from cookie.
 */
export function getAuthToken(): string | undefined {
  return Cookies.get(config.auth.tokenCookieName);
}

/**
 * Clear JWT token from cookie.
 * INVARIANT: Only the auth store should call this, via logout().
 */
export function clearAuthToken(): void {
  console.info(`${LOG_PREFIX} clearAuthToken: removing token cookie`);
  Cookies.remove(config.auth.tokenCookieName);
}

// ============================================
// JWT TOKEN UTILITIES
// Local JWT parsing for expiry checks (no API calls)
// ============================================

interface JwtPayload {
  sub?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

/**
 * Decode JWT payload without signature verification.
 * Used only for reading claims like expiry; actual validation is backend's job.
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Get token expiry as Date, or null if token is invalid/missing exp.
 */
export function getTokenExpiry(token: string): Date | null {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return new Date(payload.exp * 1000);
}

/**
 * Check if token is expired or expiring within buffer.
 */
export function isTokenExpired(token: string, bufferSeconds: number = 60): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;
  const now = new Date();
  const bufferMs = bufferSeconds * 1000;
  return expiry.getTime() - bufferMs <= now.getTime();
}

/**
 * Get auth token only if it exists and is not expired.
 */
export function getValidAuthToken(bufferSeconds: number = 60): string | undefined {
  const token = getAuthToken();
  if (!token) return undefined;
  if (isTokenExpired(token, bufferSeconds)) return undefined;
  return token;
}

// ============================================
// AUTHENTICATED FETCH
//
// INVARIANT: authFetch does NOT clear auth, redirect, or alert.
// On 401, it signals the auth store's onAuthSuspicion().
// The store decides everything. authFetch throws the error to the caller.
// ============================================

/**
 * Lazy import of auth store to avoid circular dependencies.
 * The store module imports from this service; this service
 * imports the store lazily only when authFetch encounters a 401.
 */
let _storeModule: typeof import('@/stores/auth') | null = null;

async function getAuthStore() {
  if (!_storeModule) {
    _storeModule = await import('@/stores/auth');
  }
  return _storeModule.useAuthStore;
}

/**
 * Authenticated fetch wrapper.
 *
 * On 401:
 *   1. Signals store.onAuthSuspicion() (single-flight)
 *   2. Throws the original error to the caller
 *   3. Does NOT clear auth, redirect, or alert
 *
 * Only /auth/me is authoritative for auth diagnosis.
 * A 401 from /jobs or /pages just triggers suspicion checking.
 */
export async function authFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAuthToken();

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(getApiUrl(endpoint), {
    cache: 'no-store',
    ...options,
    headers,
  });

  if (response.status === 401) {
    console.warn(
      `${LOG_PREFIX} authFetch: 401 from ${endpoint} — signaling auth suspicion`
    );

    // Signal store (single-flight revalidation via /auth/me)
    try {
      const store = await getAuthStore();
      await store.getState().onAuthSuspicion();
    } catch (err) {
      console.error(`${LOG_PREFIX} authFetch: failed to signal auth suspicion`, err);
    }

    // Throw original error to caller — no clearing, no redirecting
    throw new Error(`API returned 401 for ${endpoint}. Auth suspicion signaled.`);
  }

  return response;
}
