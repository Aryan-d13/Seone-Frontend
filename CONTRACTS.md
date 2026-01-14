# Frontend State Contracts

> **Status:** Normative  
> **Last Updated:** 2026-01-13

This document defines the invariants and contracts that govern frontend state management. Violations of these contracts are bugs.

---

## 1. Job List Invariants

**Applies to:** `useJobs` hook, `JobsList` component

```
items: Job[] is ALWAYS an array.
Empty list is represented as [], never undefined or null.
```

| Property | Type | Guarantee |
|----------|------|-----------|
| `items` | `Job[]` | Always an array, safe to call `.length` and `.map()` |
| `isLoading` | `boolean` | Always defined |
| `error` | `string \| null` | Always defined, `null` when no error |

---

## 2. Job Store Invariants

**Applies to:** `useJobStore` (Zustand store)

```
job: Job | null — null is a valid transitional state
liveClips: Clip[] — always an array
Components MUST handle job === null
```

### Reset Semantics

- `reset()` is **synchronous**
- After `reset()`, store state is:
  ```typescript
  { job: null, liveClips: [], wsConnected: false, ... }
  ```
- Components **will render** during the reset → fetch gap
- Components **must not crash** when `job` is `null`

---

## 3. Render Safety Stance

```
Stores provide type-accurate defaults (null for objects, [] for arrays).
Components are responsible for handling null states.
We do NOT use render-safe mock objects in stores.
```

**Rationale:** Mock objects mask bugs and create false positives in testing.

### Required Component Guards

| Component | Required Guard |
|-----------|----------------|
| `PipelineTimeline` | `if (!job) return null` |
| `ClipGallery` | `if (clips.length === 0) return null` |
| Job Detail Page | `if (!job) return null` |

---

## 4. REST + WebSocket Precedence

```
REST  → Initial snapshot (authoritative on mount)
WS    → Transitions (authoritative during session)
REST  → Final reconciliation on job_completed
```

### Rules

1. **Initial load:** REST is authoritative
2. **During session:** WebSocket updates via `updateJob()` (shallow merge)
3. **On `job_completed`:** REST reconciliation is final authority
4. **No timestamp comparison** — last write wins

### Known Race Windows (Accepted)

| Race | Impact | Mitigation |
|------|--------|------------|
| WS before REST completes | WS applied to stale state | `fetchStatus` gates WS connection |
| REST returns after WS update | REST overwrites | Acceptable; final state is correct |

---

## 5. Error States

| State | How Distinguished |
|-------|-------------------|
| **Loading** | `isLoading: true` or `fetchStatus: 'loading'` |
| **Error** | `error: string` or `fetchStatus: 'error'` |
| **Empty** | `items: []` AND `error: null` AND `isLoading: false` |
| **Reset/Null** | `job: null` — handled by component guards |
| **Unauthorized** | `fetchError.code === 403` or `401` response |

---

## 6. Store Persistence

| Store | Persists Across Navigation? |
|-------|----------------------------|
| `useJobStore` | ❌ No — reset on job route change |
| `useJobs` (hook state) | ❌ No — recreated on mount |
| `useAppStore` (UI state) | ✅ Yes — intentional |

---

## Contract Violations

If any of the above contracts are violated:

1. It is a **bug**, not expected behavior
2. File an issue with the specific contract violated
3. Fix at the **source**, not with defensive workarounds

---

## Changelog

- **2026-01-13:** Initial contract definition after job lifecycle stabilization
