# API and Backend Integration

> **Confidence:** CONFIRMED | **Source:** Direct code analysis of services/auth.ts and hooks

---

## Overview

The frontend communicates with the backend via:

1. **REST API** — For CRUD operations (auth, jobs, pages)
2. **WebSocket** — For real-time job updates (covered in `06_real_time_updates/`)

All REST requests use the `authFetch()` wrapper which:

- Attaches JWT token from cookie
- Handles 401 responses (session expiry)
- Redirects to login on auth failure

---

## Base Configuration

**File:** `src/lib/config.ts`

```typescript
export const config = {
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    version: 'v1',
    timeout: 30000,
  },
  ws: {
    baseUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000',
    reconnectAttempts: 5,
    reconnectDelay: 1000,
  },
  media: {
    dataBaseUrl: process.env.NEXT_PUBLIC_DATA_URL || 'http://localhost:8000/data',
  },
};
```

### Environment Variables

| Variable                       | Required   | Default                      | Purpose                |
| ------------------------------ | ---------- | ---------------------------- | ---------------------- |
| `NEXT_PUBLIC_API_URL`          | Yes (prod) | `http://localhost:8000`      | REST API base URL      |
| `NEXT_PUBLIC_WS_URL`           | Yes (prod) | `ws://localhost:8000`        | WebSocket base URL     |
| `NEXT_PUBLIC_DATA_URL`         | Yes (prod) | `http://localhost:8000/data` | Media files URL        |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes        | ""                           | Google OAuth client ID |

---

## Endpoint Configuration

**File:** `src/lib/config.ts`

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
};
```

---

## authFetch Wrapper

**File:** `src/services/auth.ts`

```typescript
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
    if (typeof window !== 'undefined') {
      alert('Session expired. Please log in again.');
    }
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  return response;
}
```

### Simple Explanation

Every API call goes through this wrapper. It automatically adds your login token and handles session expiry by redirecting you to the login page.

### Technical Explanation

- Reads JWT from cookie (`seone_token`)
- Attaches as `Authorization: Bearer <token>` header
- On 401 response: clears cookie, shows alert, redirects to `/login`, throws error
- The thrown error prevents further execution during redirect

### Why This Matters in Production

Without this wrapper, a single component forgetting to add the token would cause auth failures. Centralized handling ensures consistency.

---

## API Contracts by Endpoint

### 1. Authentication

#### POST /api/v1/auth/google

**Purpose:** Exchange Google ID token for Seone JWT

**Request:**

```
POST /api/v1/auth/google?token={google_id_token}
```

**Response (Success):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Frontend Handling:**

```typescript
const response = await fetch(url.toString(), { method: 'POST' });
const data = await response.json();
setAuthToken(data.access_token, 1800); // Store in cookie
```

**Error Handling:**

- Non-200: Parse JSON for `detail` or `message` field
- Display error to user on login page

---

#### GET /api/v1/auth/me

**Purpose:** Fetch current user info (optional — not used in current implementation)

**Request:**

```
GET /api/v1/auth/me
Authorization: Bearer {token}
```

**Response:**

```json
{
  "id": "user-uuid",
  "email": "user@creativefuel.io",
  "name": "John Doe",
  "picture": "https://...",
  "role": "user"
}
```

**Note:** Currently the frontend does NOT call this endpoint. User info is extracted from Google ID token payload instead.

---

#### POST /api/v1/auth/logout

**Purpose:** Invalidate session on server (optional cleanup)

**Request:**

```
POST /api/v1/auth/logout
Authorization: Bearer {token}
```

**Frontend Handling:**

```typescript
try {
  await fetch(getApiUrl(endpoints.auth.logout), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
} catch {
  // Ignore logout errors — clear token regardless
}
clearAuthToken();
```

---

### 2. Jobs

#### GET /api/v1/jobs

**Purpose:** List jobs for current user with pagination

**Request:**

```
GET /api/v1/jobs?page=1&per_page=10
Authorization: Bearer {token}
```

**Response:**

```json
{
  "items": [
    {
      "id": "job-uuid",
      "status": "completed",
      "phase": "completed",
      "progress": 100,
      "clip_count": 3,
      "created_at": "2026-01-19T10:00:00Z",
      "completed_at": "2026-01-19T10:05:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 10,
  "has_more": true
}
```

**Frontend Handling:**

- Normalizes various response formats (array, wrapped object)
- Handles missing pagination fields with defaults
- Updates `useJobs` hook state

---

#### POST /api/v1/jobs

**Purpose:** Create a new job

**Request:**

```json
POST /api/v1/jobs
Authorization: Bearer {token}
Content-Type: application/json

{
    "url": "https://youtube.com/watch?v=abc123",
    "min_duration": 1.0,
    "max_duration": 5.0,
    "count": 3,
    "pages": ["Modern Minimal", "Bold Creator"],
    "copy_mode": "en",
    "language": null,
    "extra_config": {
        "mode": "ai",
        "ui_language_selection": "en"
    }
}
```

**Field Mapping:**
| Frontend Form | API Field | Transformation |
|---------------|-----------|----------------|
| `youtubeUrl` | `url` | Direct |
| `minDuration` (seconds) | `min_duration` (minutes) | Divide by 60, clamp to [0.5, 10] |
| `maxDuration` (seconds) | `max_duration` (minutes) | Divide by 60, clamp to [0.5, 10] |
| `clipCount` | `count` | Direct |
| `selectedPages` (IDs) | `pages` (names) | Map ID → page.name |
| `language` | `copy_mode` | 'auto' → 'en', else direct |
| `copyMode` | `extra_config.mode` | Stored for reference |

**Response (Success):**

```json
{
  "id": "new-job-uuid",
  "status": "queued",
  "ws_url": "/ws/jobs/new-job-uuid",
  "message": "Job created successfully"
}
```

**Frontend Handling:**

- On success: Navigate to `/dashboard/jobs/{id}`
- On error: Display error message in form

---

#### GET /api/v1/jobs/{id}

**Purpose:** Fetch single job details

**Request:**

```
GET /api/v1/jobs/{id}
Authorization: Bearer {token}
```

**Response:**

```json
{
  "id": "job-uuid",
  "status": "completed",
  "phase": "completed",
  "fork_join": {
    "fork_entered_at": "2026-01-19T10:01:00Z",
    "join_satisfied_at": "2026-01-19T10:04:00Z",
    "is_forked": true,
    "join_satisfied": true
  },
  "steps": {
    "download": { "status": "completed" },
    "transcribe": { "status": "completed" },
    "analyze": { "status": "completed" },
    "smart_render": { "status": "completed" }
  },
  "progress": 100,
  "current_step": "smart_render",
  "clip_count": 3,
  "created_at": "2026-01-19T10:00:00Z",
  "started_at": "2026-01-19T10:00:05Z",
  "completed_at": "2026-01-19T10:05:00Z",
  "output": {
    "clips": [
      { "index": 0, "url": "/clips/job-uuid/clip_0.mp4", "filename": "clip_0.mp4" },
      { "index": 1, "url": "/clips/job-uuid/clip_1.mp4", "filename": "clip_1.mp4" },
      { "index": 2, "url": "/clips/job-uuid/clip_2.mp4", "filename": "clip_2.mp4" }
    ]
  }
}
```

**Frontend Handling:**

- On success: Call `setJob(data)` to update store
- On 403: Display "This job does not belong to you"
- On 404: Display "Job not found"
- On error: Display generic error

---

### 3. Pages (Templates)

#### GET /api/v1/pages

**Purpose:** List available templates

**Request:**

```
GET /api/v1/pages
Authorization: Bearer {token}
```

**Response:**

```json
{
  "pages": [
    {
      "id": "page-uuid",
      "name": "Modern Minimal",
      "slug": "modern-minimal",
      "category": "Trending",
      "description": "Clean, minimal design",
      "thumbnailUrl": "/thumbnails/modern-minimal.jpg"
    }
  ]
}
```

**Frontend Handling:**

- Cached in-memory for session (module-level variable)
- Falls back to mock data on error (development only)

---

## Error Handling Patterns

### Standard Error Response

```json
{
  "detail": "Human-readable error message"
}
```

### Error Parsing

```typescript
if (!response.ok) {
  const error = await response.json().catch(() => ({
    detail: 'Request failed',
  }));
  throw new Error(error.detail || error.message || 'Unknown error');
}
```

### Status Code Handling

| Status | Meaning          | Frontend Action                 |
| ------ | ---------------- | ------------------------------- |
| 200    | Success          | Process response                |
| 201    | Created          | Process response                |
| 401    | Unauthorized     | Clear token, redirect to login  |
| 403    | Forbidden        | Show "access denied" error      |
| 404    | Not Found        | Show "not found" error          |
| 422    | Validation Error | Show field-specific errors      |
| 500    | Server Error     | Show generic error, allow retry |
