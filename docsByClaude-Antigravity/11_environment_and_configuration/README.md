# Environment and Configuration

> **Confidence:** CONFIRMED | **Source:** Direct code analysis of lib/config.ts

---

## Environment Variables

### Required Variables

| Variable                       | Purpose                | Default (Dev)                | Example (Prod)                          |
| ------------------------------ | ---------------------- | ---------------------------- | --------------------------------------- |
| `NEXT_PUBLIC_API_URL`          | REST API base URL      | `http://localhost:8000`      | `https://api.seone.io`                  |
| `NEXT_PUBLIC_WS_URL`           | WebSocket base URL     | `ws://localhost:8000`        | `wss://api.seone.io`                    |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID | `""`                         | `123456-abc.apps.googleusercontent.com` |
| `NEXT_PUBLIC_DATA_URL`         | Media files URL        | `http://localhost:8000/data` | `https://cdn.seone.io`                  |

### Environment File

Create `.env.local` in project root:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
NEXT_PUBLIC_DATA_URL=http://localhost:8000/data
```

**Note:** File is gitignored for security.

---

## Configuration Object

**File:** `src/lib/config.ts`

```typescript
export const config = {
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    version: 'v1',
    timeout: 30000, // 30 seconds
  },

  ws: {
    baseUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000',
    reconnectAttempts: 5,
    reconnectDelay: 1000,
  },

  auth: {
    googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
    allowedDomain: ['creativefuel.io'],
    tokenCookieName: 'seone_token',
    tokenExpiry: 7, // days
  },

  media: {
    dataBaseUrl: process.env.NEXT_PUBLIC_DATA_URL || 'http://localhost:8000/data',
  },
} as const;
```

---

## URL Helpers

### API URL

```typescript
export const getApiUrl = (endpoint: string): string => {
  return `${config.api.baseUrl}${endpoint}`;
};

// Usage: getApiUrl('/api/v1/jobs') → 'http://localhost:8000/api/v1/jobs'
```

### WebSocket URL

```typescript
export const getWsUrl = (endpoint: string): string => {
  return `${config.ws.baseUrl}${endpoint}`;
};

// Usage: getWsUrl('/ws/jobs/123') → 'ws://localhost:8000/ws/jobs/123'
```

### Media URL

```typescript
export const getMediaUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${config.media.dataBaseUrl}/${cleanPath}`;
};

// Usage: getMediaUrl('/clips/job-id/clip_0.mp4')
//     → 'http://localhost:8000/data/clips/job-id/clip_0.mp4'
```

---

## Endpoint Configuration

```typescript
export const endpoints = {
  auth: {
    google: '/api/v1/auth/google',
    me: '/api/v1/auth/me',
    logout: '/api/v1/auth/logout',
  },
  jobs: {
    list: '/api/v1/jobs',
    create: '/api/v1/jobs',
    get: (id: string) => `/api/v1/jobs/${id}`,
    delete: (id: string) => `/api/v1/jobs/${id}`,
  },
  pages: {
    list: '/api/v1/pages',
    get: (id: string) => `/api/v1/pages/${id}`,
  },
  ws: {
    job: (jobId: string) => `/ws/jobs/${jobId}`,
  },
} as const;
```

---

## Protocol Validation

On module load, validates WebSocket protocol:

```typescript
function validateWsConfig(): void {
  if (typeof window === 'undefined') return;

  const isSecurePage = window.location.protocol === 'https:';
  const isSecureWs = config.ws.baseUrl.startsWith('wss://');

  if (isSecurePage && !isSecureWs) {
    console.error(
      '[FATAL CONFIG] Secure page (https) attempting non-secure WebSocket (ws://).\n' +
        `Current WS URL: ${config.ws.baseUrl}\n` +
        'Fix NEXT_PUBLIC_WS_URL to use wss:// in production.'
    );
  }

  if (process.env.NODE_ENV === 'production' && !isSecureWs) {
    console.warn('[CONFIG WARNING] WebSocket URL is not secure (wss://).');
  }
}

validateWsConfig();
```

**Why?** Mixed content (HTTPS page + WS endpoint) fails silently. This catches misconfiguration early.

---

## TypeScript Configuration

**File:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "strict": true,
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Key Settings:**

- `strict: true` — Full type checking
- `@/*` path alias — Import from `@/components` instead of `../../components`

---

## Next.js Configuration

**File:** `next.config.ts`

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
```

Currently using defaults. Potential additions:

- `images.domains` for external image hosts
- `rewrites` for API proxying
- `experimental` features
