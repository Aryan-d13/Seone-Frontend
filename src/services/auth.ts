// ============================================
// AUTH SERVICE
// Google OAuth and JWT management
// ============================================

import Cookies from 'js-cookie';
import { config, getApiUrl, endpoints } from '@/lib/config';
import type { AuthResponse, User, ApiError } from '@/types';

/**
 * Exchange Google ID token for Seone JWT
 */
export async function exchangeGoogleToken(idToken: string): Promise<AuthResponse> {
    // Backend expects token as query parameter
    const url = new URL(getApiUrl(endpoints.auth.google));
    url.searchParams.set('token', idToken);

    const response = await fetch(url.toString(), {
        method: 'POST',
    });

    if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
            message: 'Authentication failed',
            code: 'AUTH_ERROR',
        }));
        throw new Error(error.detail || error.message);
    }

    const data = await response.json();

    // Map backend response to frontend format
    // Backend returns: { access_token, token_type }
    const authResponse: AuthResponse = {
        accessToken: data.access_token,
        expiresIn: 1800, // 30 minutes as per backend
        user: {
            // Decode user from JWT or use placeholder until /me endpoint
            id: '',
            email: '',
            name: '',
            role: 'user' as const,
        },
    };

    // Store JWT in secure cookie
    setAuthToken(authResponse.accessToken, authResponse.expiresIn);

    return authResponse;
}


/**
 * Get current user from stored token
 */
export async function getCurrentUser(): Promise<User | null> {
    const token = getAuthToken();
    if (!token) return null;

    try {
        const response = await fetch(getApiUrl(endpoints.auth.me), {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            if (response.status === 401) {
                clearAuthToken();
                return null;
            }
            throw new Error('Failed to fetch user');
        }

        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
    const token = getAuthToken();

    if (token) {
        try {
            await fetch(getApiUrl(endpoints.auth.logout), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
        } catch {
            // Ignore logout errors
        }
    }

    clearAuthToken();
}

/**
 * Store JWT token in secure cookie
 */
export function setAuthToken(token: string, expiresInSeconds?: number): void {
    const expires = expiresInSeconds
        ? expiresInSeconds / 86400 // Convert seconds to days
        : config.auth.tokenExpiry;

    Cookies.set(config.auth.tokenCookieName, token, {
        expires,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
    });
}

/**
 * Get JWT token from cookie
 */
export function getAuthToken(): string | undefined {
    return Cookies.get(config.auth.tokenCookieName);
}

/**
 * Clear JWT token from cookie
 */
export function clearAuthToken(): void {
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

        // Base64url decode the payload (2nd part)
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
 * @param token JWT string
 * @param bufferSeconds How many seconds before actual expiry to consider it expired (default: 60)
 */
export function isTokenExpired(token: string, bufferSeconds: number = 60): boolean {
    const expiry = getTokenExpiry(token);
    if (!expiry) return true; // Treat unparseable tokens as expired

    const now = new Date();
    const bufferMs = bufferSeconds * 1000;
    return expiry.getTime() - bufferMs <= now.getTime();
}

/**
 * Get auth token only if it exists and is not expired.
 * Returns undefined if no token or token is expired/expiring.
 */
export function getValidAuthToken(bufferSeconds: number = 60): string | undefined {
    const token = getAuthToken();
    if (!token) return undefined;
    if (isTokenExpired(token, bufferSeconds)) return undefined;
    return token;
}

/**
 * Check if email domain is allowed
 */
export function isAllowedDomain(email: string): boolean {
    const domain = email.split('@')[1];
    return domain === config.auth.allowedDomain;
}

/**
 * Create authenticated fetch wrapper
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
        ...options,
        headers,
    });

    // Handle token expiry
    if (response.status === 401) {
        clearAuthToken();
        // Surface message before redirect (temporary UX until toast system exists)
        if (typeof window !== 'undefined') {
            alert('Session expired. Please log in again.');
        }
        window.location.href = '/login';
        // Throw to prevent further execution during redirect
        // This eliminates race conditions where React renders with torn-down state
        throw new Error('Session expired');
    }

    return response;
}
