# Authentication and Sessions

> **Confidence:** CONFIRMED | **Source:** Direct code analysis of services/auth.ts, stores/auth.ts, login page

---

## Overview

Seone uses **Google OAuth 2.0** for authentication:

1. User clicks "Sign in with Google"
2. Google ID token received via `@react-oauth/google`
3. Token exchanged with backend for Seone JWT
4. JWT stored in cookie, user info in sessionStorage
5. JWT attached to all API requests

---

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER CLICKS LOGIN                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  GoogleLogin      │
                    │  Component        │
                    │  (@react-oauth)   │
                    └───────────────────┘
                              │
                              │ Google OAuth popup
                              │ User selects account
                              ▼
                    ┌───────────────────┐
                    │  onSuccess        │
                    │  callback         │
                    │  credential: JWT  │
                    └───────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  Decode Google    │
                    │  ID Token         │
                    │  (client-side)    │
                    └───────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  Check Domain     │
                    │  @creativefuel.io │
                    │  required         │
                    └───────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │ ALLOWED                        │ BLOCKED
              ▼                                ▼
    ┌─────────────────────┐         ┌─────────────────────┐
    │ POST /api/v1/auth/  │         │ Show error:         │
    │ google?token=...    │         │ "Only @xyz allowed" │
    └─────────────────────┘         └─────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │ Receive Seone JWT   │
    │ access_token        │
    └─────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │ Store JWT in cookie │
    │ (seone_token)       │
    │ httpOnly=false      │
    │ secure=true (prod)  │
    │ sameSite=strict     │
    └─────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │ Extract user info   │
    │ from Google token   │
    │ (sub, email, name,  │
    │  picture)           │
    └─────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │ setUser() in store  │
    │ Persisted to        │
    │ sessionStorage      │
    └─────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │ router.replace()    │
    │ → /dashboard        │
    └─────────────────────┘
```

---

## Domain Restriction

**File:** `src/lib/config.ts`
```typescript
auth: {
    allowedDomain: ['creativefuel.io'],
}
```

**File:** `src/services/auth.ts`
```typescript
export function isAllowedDomain(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase();
    return (config.auth.allowedDomain as readonly string[]).includes(domain);
}
```

### Login Page Check

```typescript
const payload = JSON.parse(atob(response.credential.split('.')[1]));

if (!isAllowedDomain(payload.email)) {
    setError(`Only @${config.auth.allowedDomain.join(', @')} accounts are allowed.`);
    return;
}
```

**Why Client-Side?** Fail fast. Don't waste a backend round-trip for unauthorized domains.

**Backend Also Checks:** The backend performs its own domain validation. Client-side is UX optimization only.

---

## JWT Token Management

### Storing the Token

**File:** `src/services/auth.ts`

```typescript
export function setAuthToken(token: string, expiresInSeconds?: number): void {
    const expires = expiresInSeconds
        ? expiresInSeconds / 86400  // Convert seconds to days
        : config.auth.tokenExpiry;  // Default: 7 days

    Cookies.set(config.auth.tokenCookieName, token, {
        expires,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
    });
}
```

**Cookie Name:** `seone_token`
**Expiry:** 30 minutes (backend default), frontend stores 7 days as fallback

### Reading the Token

```typescript
export function getAuthToken(): string | undefined {
    return Cookies.get(config.auth.tokenCookieName);
}
```

### Clearing the Token

```typescript
export function clearAuthToken(): void {
    Cookies.remove(config.auth.tokenCookieName);
}
```

---

## Token Expiry Handling

### JWT Payload Decoding

```typescript
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
```

**Note:** This is NOT signature verification. Backend still validates the token. Client-side decoding is for expiry checks only.

### Expiry Check

```typescript
export function isTokenExpired(token: string, bufferSeconds: number = 60): boolean {
    const expiry = getTokenExpiry(token);
    if (!expiry) return true;  // Treat unparseable as expired
    
    const now = new Date();
    const bufferMs = bufferSeconds * 1000;
    return expiry.getTime() - bufferMs <= now.getTime();
}
```

**Buffer:** Default 60 seconds before actual expiry. Prevents edge case where token expires mid-request.

### Get Valid Token

```typescript
export function getValidAuthToken(bufferSeconds: number = 60): string | undefined {
    const token = getAuthToken();
    if (!token) return undefined;
    if (isTokenExpired(token, bufferSeconds)) return undefined;
    return token;
}
```

Used by WebSocket connection to ensure token won't expire during connection.

---

## Session Persistence

### Auth Store with Persistence

**File:** `src/stores/auth.ts`

```typescript
export const useAuthStore = create<AuthStore>()(
    persist(
        (set, get) => ({ ... }),
        {
            name: 'seone-auth',
            storage: createJSONStorage(() => sessionStorage),
            partialize: (state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);
```

**What's Persisted:**
- `user` (object with name, email, picture, etc.)
- `isAuthenticated` (boolean)

**What's NOT Persisted:**
- `isLoading` (always starts as true)

### Session Initialization

```typescript
initialize: async () => {
    const token = getAuthToken();
    const currentState = get();

    // Token + persisted user → authenticated
    if (token && currentState.user) {
        set({ isLoading: false, isAuthenticated: true });
        return;
    }

    // No token → not authenticated
    if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
    }

    // Token but no user → inconsistent, clear state
    set({ user: null, isAuthenticated: false, isLoading: false });
}
```

**Key Decision:** Does NOT call `/me` API. Relies on persisted state.

**Why?** 
1. Faster page loads (no API wait)
2. User info from Google token is sufficient
3. If token is invalid, backend will return 401 which triggers login

---

## AuthGuard Component

**File:** `src/components/layout/AuthGuard.tsx`

### Purpose
- Protect routes that require authentication
- Redirect authenticated users away from login page

### Implementation

```typescript
export function AuthGuard({
    children,
    requireAuth = true,
    redirectTo,
}: AuthGuardProps) {
    const router = useRouter();
    const { isAuthenticated, isLoading, initialize } = useAuthStore();

    // Initialize auth on mount
    useEffect(() => {
        initialize();
    }, [initialize]);

    // Handle redirects
    useEffect(() => {
        if (isLoading) return;

        if (requireAuth && !isAuthenticated) {
            router.replace(redirectTo || '/login');
        } else if (!requireAuth && isAuthenticated) {
            router.replace(redirectTo || '/dashboard');
        }
    }, [isAuthenticated, isLoading, requireAuth, redirectTo, router]);

    // Loading state
    if (isLoading) {
        return <div className="auth-loading"><div className="auth-loading-spinner" /></div>;
    }

    // Don't render children if redirect needed
    if (requireAuth && !isAuthenticated) return null;
    if (!requireAuth && isAuthenticated) return null;

    return <>{children}</>;
}
```

### Usage

```typescript
// Dashboard layout - require auth
<AuthGuard requireAuth={true} redirectTo="/login">
    <AppShell>{children}</AppShell>
</AuthGuard>

// Login page - redirect if already authenticated
<AuthGuard requireAuth={false} redirectTo="/dashboard">
    <LoginPage />
</AuthGuard>
```

---

## Logout Flow

### TopBar Logout Button

```typescript
const handleLogout = async () => {
    await logout();
    router.replace('/login');
};
```

### Store Logout Action

```typescript
logout: async () => {
    set({ isLoading: true });
    await logoutService();  // Calls POST /api/v1/auth/logout
    set({ user: null, isAuthenticated: false, isLoading: false });
}
```

### Service Logout

```typescript
export async function logout(): Promise<void> {
    const token = getAuthToken();

    if (token) {
        try {
            await fetch(getApiUrl(endpoints.auth.logout), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            });
        } catch {
            // Ignore logout errors — clear token regardless
        }
    }

    clearAuthToken();
}
```

**Key Behavior:** Even if backend logout fails, clear the cookie. User should be logged out locally.

---

## Session Handling on 401

**File:** `src/services/auth.ts`

```typescript
if (response.status === 401) {
    clearAuthToken();
    if (typeof window !== 'undefined') {
        alert('Session expired. Please log in again.');
    }
    window.location.href = '/login';
    throw new Error('Session expired');
}
```

### Simple Explanation
If any API call returns "unauthorized," we assume the session is expired, clear everything, and send the user to login.

### Technical Explanation
- 401 could mean: expired token, revoked token, tampered token
- Alert provides user feedback (temporary UX until toast system exists)
- Hard redirect via `window.location.href` ensures full page reload
- Thrown error prevents further code execution during redirect

### Why This Matters in Production
Without centralized 401 handling, components might continue executing with invalid state, causing confusing errors or data inconsistencies.

---

## Security Considerations

| Aspect | Implementation | Rationale |
|--------|----------------|-----------|
| Token Storage | Cookie (not localStorage) | Automatic inclusion in requests |
| Cookie Secure Flag | `secure: true` in production | Prevents transmission over HTTP |
| Cookie SameSite | `strict` | CSRF protection |
| Session Scope | sessionStorage | Clears when browser closes |
| Domain Restriction | Client + server validation | Fail fast + defense in depth |
| Token Expiry | 30 min backend, client checks | Short-lived tokens reduce risk |
