# Frontend Architecture

> **Confidence:** CONFIRMED | **Source:** Direct code analysis

---

## Technology Stack

### Core Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.1.1 | App Router, SSR, routing |
| **React** | 19.2.3 | UI components, hooks |
| **TypeScript** | ^5 | Type safety |

### State Management
| Technology | Version | Purpose |
|------------|---------|---------|
| **Zustand** | ^5.0.10 | Global state management |

### Styling & Animation
| Technology | Version | Purpose |
|------------|---------|---------|
| **CSS Modules** | (built-in) | Scoped component styles |
| **Framer Motion** | ^12.26.1 | Animations and transitions |
| **clsx** | ^2.1.1 | Conditional class names |

### Authentication
| Technology | Version | Purpose |
|------------|---------|---------|
| **@react-oauth/google** | ^0.13.4 | Google OAuth integration |
| **js-cookie** | ^3.0.5 | Cookie management for JWT |

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS APP ROUTER                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐    ┌─────────────────┐    ┌──────────────────────┐ │
│  │   ROUTES    │    │    LAYOUTS      │    │      PAGES           │ │
│  │  (auth)     │───▶│  GoogleOAuth    │───▶│   login/page.tsx     │ │
│  │  (dashboard)│    │  AuthGuard      │    │   dashboard/page.tsx │ │
│  │             │    │  AppShell       │    │   jobs/page.tsx      │ │
│  │             │    │                 │    │   jobs/[id]/page.tsx │ │
│  │             │    │                 │    │   new/page.tsx       │ │
│  └─────────────┘    └─────────────────┘    └──────────────────────┘ │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                           COMPONENT LAYER                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐            │
│  │    LAYOUT     │  │      JOB      │  │      UI       │            │
│  ├───────────────┤  ├───────────────┤  ├───────────────┤            │
│  │ AppShell      │  │ ClipGallery   │  │ Button        │            │
│  │ AuthGuard     │  │ JobsList      │  │ Input         │            │
│  │ Sidebar       │  │ PipelineTime. │  │ DualRangeSlid │            │
│  │ TopBar        │  │ SubmitPanel   │  │               │            │
│  │ Inspector     │  │ TemplateSelec │  │               │            │
│  │ PageTransition│  │               │  │               │            │
│  └───────────────┘  └───────────────┘  └───────────────┘            │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                             DATA LAYER                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐            │
│  │    HOOKS      │  │    STORES     │  │   SERVICES    │            │
│  ├───────────────┤  ├───────────────┤  ├───────────────┤            │
│  │ useJobs       │  │ useAuthStore  │  │ auth.ts       │            │
│  │ useJobSubmit  │  │ useJobStore   │  │ (authFetch)   │            │
│  │ useJobWebSock │  │ useAppStore   │  │               │            │
│  │ usePages      │  │               │  │               │            │
│  └───────────────┘  └───────────────┘  └───────────────┘            │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                          EXTERNAL SERVICES                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────────────────┐    ┌─────────────────────────────┐   │
│  │     REST API              │    │        WEBSOCKET            │   │
│  │  /api/v1/auth/*           │    │  /ws/jobs/{id}?token=       │   │
│  │  /api/v1/jobs/*           │    │                             │   │
│  │  /api/v1/pages/*          │    │                             │   │
│  └───────────────────────────┘    └─────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Design Patterns

### 1. Container/Presenter Pattern (Implicit)

**Pattern:** Pages act as containers that fetch data and pass it to presentational components.

**Example:**
```tsx
// Page (Container) - src/app/(dashboard)/dashboard/new/page.tsx
export default function NewJobPage() {
    const { formData, errors, state, updateField, togglePage, submit } = useJobSubmit();
    
    return (
        <SubmitPanel formData={formData} onUpdateField={updateField} />
        <TemplateSelector selectedPages={formData.selectedPages} onToggle={togglePage} />
    );
}

// Component (Presenter) - receives data via props, renders UI
export function SubmitPanel({ formData, onUpdateField }: Props) { ... }
```

### 2. Custom Hooks for Data Fetching

**Pattern:** All data fetching is encapsulated in custom hooks.

| Hook | Responsibility |
|------|----------------|
| `useJobs()` | Fetch paginated job list, handle pagination |
| `useJobSubmit()` | Form state, validation, job creation |
| `useJobWebSocket()` | WebSocket connection, event handling, polling |
| `usePages()` | Fetch available templates with caching |

**Why:** Separates data logic from UI logic. Components stay focused on rendering.

### 3. Zustand Store Pattern

**Pattern:** Minimal, focused stores with clear contracts.

```tsx
// src/stores/job.ts - Single responsibility: job detail state
interface JobState {
    job: Job | null;        // Current job being viewed
    liveClips: Clip[];      // Clips received via WebSocket
    wsConnected: boolean;   // WebSocket connection status
    // ... actions
}
```

**Key Principle:** Stores provide type-accurate defaults:
- Objects → `null`
- Arrays → `[]`
- Booleans → explicit `true/false`

**Never:** Use mock objects as defaults (masks bugs).

### 4. REST + WebSocket Hybrid

**Pattern:** REST for initial load and reconciliation; WebSocket for real-time updates.

```
1. Page Mount      → REST fetch (authoritative snapshot)
2. WebSocket Open  → Subscribe to events
3. Events Arrive   → Update local state incrementally
4. Job Completed   → REST reconciliation (final authority)
5. Polling         → Every 3s while job is active (redundancy)
```

**Why:** WebSocket can miss events (late connect, disconnect). REST ensures eventual consistency.

---

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/             # Route group: public auth pages
│   │   ├── layout.tsx      # Wraps children in GoogleOAuthProvider
│   │   └── login/
│   ├── (dashboard)/        # Route group: protected dashboard pages
│   │   ├── layout.tsx      # Wraps children in AuthGuard + AppShell
│   │   └── dashboard/
│   ├── globals.css         # Design system, CSS variables
│   ├── layout.tsx          # Root layout (fonts, PageTransition)
│   └── page.tsx            # Landing page
│
├── components/
│   ├── job/                # Job-related components
│   ├── layout/             # Layout components (shell, sidebar, etc.)
│   └── ui/                 # Reusable UI primitives
│
├── hooks/                  # Custom React hooks
│   ├── useJobs.ts          # Job list fetching
│   ├── useJobSubmit.ts     # Job creation form
│   ├── useJobWebSocket.ts  # WebSocket + polling
│   └── usePages.ts         # Template fetching
│
├── lib/                    # Utilities and config
│   ├── animations.ts       # Framer Motion presets
│   ├── config.ts           # Environment config, endpoints
│   └── utils.ts            # Helper functions
│
├── services/               # API service layer
│   └── auth.ts             # Auth functions, authFetch wrapper
│
├── stores/                 # Zustand stores
│   ├── app.ts              # UI state (sidebar, inspector)
│   ├── auth.ts             # Auth state (user, tokens)
│   └── job.ts              # Job detail state
│
└── types/                  # TypeScript type definitions
    ├── index.ts            # Core types (User, Job, Clip, etc.)
    └── job.ts              # Form-specific types
```

---

## Key Architectural Decisions

### 1. App Router Route Groups

**Decision:** Use `(auth)` and `(dashboard)` route groups to apply different layouts.

**Rationale:**
- `(auth)` routes need GoogleOAuthProvider but no auth guard
- `(dashboard)` routes need AuthGuard and AppShell
- Route groups don't affect URL structure

### 2. sessionStorage for Auth Persistence

**Decision:** Auth state persisted to sessionStorage, not localStorage.

**Rationale:**
- Session ends when browser closes (security)
- JWT in cookie for API requests (automatic)
- User info in sessionStorage for display only

### 3. CSS Modules over Tailwind

**Decision:** CSS Modules with a custom design system.

**Rationale:**
- Full control over design tokens
- No runtime CSS-in-JS overhead
- Better for premium, branded UI

### 4. Clip Merging Logic

**Decision:** Complex clip de-duplication in `useJobStore`.

**Rationale:**
- WebSocket sends clips incrementally
- REST returns full clip array
- Must merge without duplicates
- Must maintain sort order by index

```tsx
// src/stores/job.ts
const mergeClips = (base: Clip[], incoming: Clip[]): Clip[] => {
    const byKey = new Map<string, Clip>();
    for (const clip of base) byKey.set(getClipKey(clip), clip);
    for (const clip of incoming) byKey.set(getClipKey(clip), clip);
    return sortClips(Array.from(byKey.values()));
};
```

---

## Performance Considerations

1. **Selective Zustand Subscriptions:** Components select only needed state slices
2. **Staggered Animations:** Lists use stagger containers to prevent frame drops
3. **Pages Cache:** Template list cached in-memory to avoid refetching
4. **Conditional WebSocket:** Only connects for active (non-terminal) jobs
5. **Polling Stops:** When job reaches terminal state (completed/failed)
