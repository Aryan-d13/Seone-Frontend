# State Management

> **Confidence:** CONFIRMED | **Source:** Direct code analysis of stores/ and CONTRACTS.md

---

## Overview

Seone uses **Zustand** for global state management. There are **three stores**, each with a single responsibility:

| Store          | Purpose                                         | Persistence                  |
| -------------- | ----------------------------------------------- | ---------------------------- |
| `useAuthStore` | Authentication state (user, tokens)             | sessionStorage               |
| `useJobStore`  | Active job state (job detail, clips, WS status) | None (reset on route change) |
| `useAppStore`  | UI state (sidebar, inspector)                   | None (persists in memory)    |

---

## Store Contracts

These are **normative invariants** from `CONTRACTS.md`. Violations are bugs.

### useAuthStore Invariants

| Property          | Type           | Guarantee                      |
| ----------------- | -------------- | ------------------------------ |
| `user`            | `User \| null` | `null` means not authenticated |
| `isAuthenticated` | `boolean`      | Always defined                 |
| `isLoading`       | `boolean`      | Always defined                 |

### useJobStore Invariants

| Property      | Type          | Guarantee                          |
| ------------- | ------------- | ---------------------------------- |
| `job`         | `Job \| null` | `null` is valid transitional state |
| `liveClips`   | `Clip[]`      | Always an array, never undefined   |
| `wsConnected` | `boolean`     | Always defined                     |

### Reset Semantics

- `reset()` is **synchronous**
- After `reset()`: `{ job: null, liveClips: [], wsConnected: false }`
- Components **will render** during reset → fetch gap
- Components **must not crash** when `job` is `null`

---

## Store: `useAuthStore`

**File:** `src/stores/auth.ts`

### State Shape

```typescript
interface AuthStore extends AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
  initialize: () => Promise<void>;
  logout: () => Promise<void>;
}
```

### Persistence

```typescript
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
```

**What's Persisted:** `user` and `isAuthenticated` — NOT `isLoading`

**Storage:** sessionStorage (cleared when browser closes)

**Why Not localStorage?** Security — session should end when user closes browser.

### Actions

#### `setUser(user: User | null)`

Sets user and derives `isAuthenticated`:

```typescript
set({
  user,
  isAuthenticated: !!user,
  isLoading: false,
});
```

#### `initialize()`

Called on app load to restore session:

```typescript
const token = getAuthToken();
const currentState = get();

if (token && currentState.user) {
  // Token exists and we have persisted user → authenticated
  set({ isLoading: false, isAuthenticated: true });
} else if (!token) {
  // No token → not authenticated
  set({ user: null, isAuthenticated: false, isLoading: false });
} else {
  // Token but no user → inconsistent, clear state
  set({ user: null, isAuthenticated: false, isLoading: false });
}
```

**Key Insight:** Does NOT call `/me` API. Relies on persisted state + token presence.

#### `logout()`

```typescript
set({ isLoading: true });
await logoutService(); // Calls POST /api/v1/auth/logout
set({ user: null, isAuthenticated: false, isLoading: false });
```

---

## Store: `useJobStore`

**File:** `src/stores/job.ts`

### State Shape

```typescript
interface JobState {
  job: Job | null;
  liveClips: Clip[];
  wsConnected: boolean;
  lastEventAt: string | null;
  isLoading: boolean;
  error: string | null;

  setJob: (job: Job) => void;
  updateJob: (updates: Partial<Job>) => void;
  addClip: (clip: Clip) => void;
  setWsConnected: (connected: boolean) => void;
  setLastEventAt: (timestamp: string) => void;
  setError: (error: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  reset: () => void;
}
```

### Clip Management

#### Clip Deduplication Key

```typescript
const getClipKey = (clip: Clip): string => {
  const index = Number(clip.index);
  if (Number.isFinite(index)) return `index:${index}`;
  if (clip.url) return `url:${clip.url}`;
  if (clip.filename) return `file:${clip.filename}`;
  return `unknown:${JSON.stringify(clip)}`;
};
```

**Priority:** index → url → filename → stringified object

#### Clip Sorting

```typescript
const sortClips = (clips: Clip[]): Clip[] => {
  return [...clips].sort((a, b) => {
    const aValid = Number.isFinite(Number(a.index));
    const bValid = Number.isFinite(Number(b.index));

    if (aValid && bValid) return aIndex - bIndex;
    if (aValid) return -1;
    if (bValid) return 1;
    return 0;
  });
};
```

**Clips with valid indices come first, sorted ascending.**

#### Clip Merging

```typescript
const mergeClips = (base: Clip[], incoming: Clip[]): Clip[] => {
  if (base.length === 0) return sortClips(incoming);
  if (incoming.length === 0) return sortClips(base);

  const byKey = new Map<string, Clip>();
  for (const clip of base) byKey.set(getClipKey(clip), clip);
  for (const clip of incoming) byKey.set(getClipKey(clip), clip);

  return sortClips(Array.from(byKey.values()));
};
```

**Incoming clips overwrite existing clips with same key.**

### Actions

#### `setJob(job: Job)`

```typescript
set(state => {
  const isSameJob = state.job?.id === job.id;
  const mergedClips = mergeClips(
    isSameJob ? state.liveClips : [],
    job.output?.clips ?? []
  );

  return { job, liveClips: mergedClips, error: null };
});
```

**If navigating to same job:** Merge existing liveClips with new clips
**If navigating to different job:** Start fresh with job's clips

#### `updateJob(updates: Partial<Job>)`

Shallow merge for incremental WebSocket updates:

```typescript
set(state => ({
  job: state.job ? { ...state.job, ...updates } : null,
}));
```

#### `addClip(clip: Clip)`

Add single clip from WebSocket event:

```typescript
set(state => {
  const clipKey = getClipKey(clip);
  if (state.liveClips.some(existing => getClipKey(existing) === clipKey)) {
    return {}; // Already have this clip, no-op
  }
  return { liveClips: sortClips([...state.liveClips, clip]) };
});
```

#### `reset()`

Clear all state for job navigation:

```typescript
set({
  job: null,
  liveClips: [],
  wsConnected: false,
  lastEventAt: null,
  isLoading: false,
  error: null,
});
```

---

## Store: `useAppStore`

**File:** `src/stores/app.ts`

### State Shape

```typescript
interface AppState {
  isInspectorOpen: boolean;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;

  isSidebarOpen: boolean; // Mobile only
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;
}
```

### Simple Explanation

This store tracks which panels are open/closed and which job is currently selected (for the Inspector panel).

### Default Values

```typescript
{
    isInspectorOpen: true,   // Inspector open by default
    isSidebarOpen: false,    // Mobile sidebar closed by default
    activeJobId: null,
}
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER ACTIONS                              │
├─────────────────────────────────────────────────────────────────┤
│  Login │ Navigate │ Submit Job │ Select Job │ Toggle Panel      │
└────────┬──────────┬─────────────┬────────────┬──────────────────┘
         │          │             │            │
         ▼          │             │            │
┌─────────────────┐ │             │            │
│ useAuthStore    │ │             │            │
│ ─────────────── │ │             │            │
│ user            │ │             │            │
│ isAuthenticated │ │             │            │
│ isLoading       │ │             │            │
└─────────────────┘ │             │            │
                    │             │            │
                    ▼             │            │
        ┌───────────────────┐     │            │
        │ Route Navigation  │     │            │
        │ AuthGuard check   │     │            │
        └───────────────────┘     │            │
                                  │            │
                                  ▼            │
                    ┌───────────────────────┐  │
                    │ useJobStore           │  │
                    │ ───────────────────── │  │
                    │ job (from REST)       │  │
                    │ liveClips (from WS)   │  │
                    │ wsConnected           │  │
                    │ error                 │  │
                    └───────────────────────┘  │
                              ▲                │
                              │                │
              ┌───────────────┴───────────────┐│
              │                               ││
   ┌──────────────────┐   ┌──────────────────┐│
   │   REST API       │   │   WebSocket      ││
   │ GET /jobs/{id}   │   │ WS /ws/jobs/{id} ││
   └──────────────────┘   └──────────────────┘│
                                              │
                                              ▼
                              ┌───────────────────────┐
                              │ useAppStore           │
                              │ ───────────────────── │
                              │ isInspectorOpen       │
                              │ isSidebarOpen         │
                              │ activeJobId           │
                              └───────────────────────┘
```

---

## Component Usage Patterns

### Accessing Store State

```tsx
// ✅ Correct: Select only needed state (minimal re-renders)
const user = useAuthStore(state => state.user);
const job = useJobStore(state => state.job);

// ❌ Avoid: Selecting entire store (re-renders on any change)
const authStore = useAuthStore(); // Don't do this
```

### Accessing Store Actions

```tsx
// Actions can be selected individually
const setJob = useJobStore(state => state.setJob);
const reset = useJobStore(state => state.reset);

// Or destructured together
const { job, setJob, updateJob, reset } = useJobStore();
```

### Component Guards

Required guard patterns for null safety:

```tsx
// PipelineTimeline
const job = useJobStore(state => state.job);
if (!job) return null; // Required guard

// ClipGallery
const liveClips = useJobStore(state => state.liveClips);
const clips = liveClips.length > 0 ? liveClips : job?.output?.clips || [];
if (clips.length === 0) return null; // Required guard
```
