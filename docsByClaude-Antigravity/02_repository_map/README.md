# Repository Map

> **Confidence:** CONFIRMED | **Source:** Direct file system scan

This document provides a **complete inventory** of every file in the Seone Frontend repository.

---

## Root Directory

| File | Purpose | Key Contents |
|------|---------|--------------|
| `package.json` | Dependencies, scripts | Next.js 16, React 19, Zustand, Framer Motion |
| `tsconfig.json` | TypeScript config | Strict mode, path alias `@/*` → `./src/*` |
| `next.config.ts` | Next.js config | Currently empty (defaults) |
| `eslint.config.mjs` | ESLint config | Next.js ESLint preset |
| `.prettierrc` | Prettier config | Code formatting rules |
| `.gitignore` | Git ignore rules | node_modules, .next, .env.local |
| `CONTRACTS.md` | State contracts | Frontend invariants (normative document) |
| `README.md` | Project readme | Basic setup instructions |

---

## `/src/app` — Pages and Layouts

### Root Level
| File | Type | Purpose |
|------|------|---------|
| `layout.tsx` | Server Component | Root layout with Inter/JetBrains fonts, PageTransition wrapper |
| `page.tsx` | Client Component | Landing page with hero section, feature cards, CTAs |
| `globals.css` | Stylesheet | Design system: CSS variables, utility classes, animations |
| `page.module.css` | CSS Module | Landing page styles |
| `favicon.ico` | Asset | Browser tab icon |

### `/src/app/(auth)` — Authentication Route Group
| File | Type | Purpose |
|------|------|---------|
| `layout.tsx` | Server Component | Wraps children in `GoogleOAuthProvider` |

### `/src/app/(auth)/login`
| File | Type | Purpose |
|------|------|---------|
| `page.tsx` | Client Component | Login page with Google OAuth button, domain validation |
| `page.module.css` | CSS Module | Login page styles |

### `/src/app/(dashboard)` — Dashboard Route Group
| File | Type | Purpose |
|------|------|---------|
| `layout.tsx` | Server Component | Wraps children in `AuthGuard` + `AppShell` |

### `/src/app/(dashboard)/dashboard`
| File | Type | Purpose |
|------|------|---------|
| `page.tsx` | Client Component | Dashboard home: welcome message, stats cards, quick actions |
| `page.module.css` | CSS Module | Dashboard page styles |

### `/src/app/(dashboard)/dashboard/new`
| File | Type | Purpose |
|------|------|---------|
| `page.tsx` | Client Component | New job page: SubmitPanel + TemplateSelector |
| `page.module.css` | CSS Module | New job page styles |

### `/src/app/(dashboard)/dashboard/jobs`
| File | Type | Purpose |
|------|------|---------|
| `page.tsx` | Client Component | Jobs list page: renders `JobsList` component |
| `page.module.css` | CSS Module | Jobs list page styles |

### `/src/app/(dashboard)/dashboard/jobs/[id]`
| File | Type | Purpose |
|------|------|---------|
| `page.tsx` | Client Component | Job detail page: REST fetch → WebSocket → PipelineTimeline + ClipGallery |
| `page.module.css` | CSS Module | Job detail page styles |

---

## `/src/components` — Reusable Components

### `/src/components/layout` — Layout Components
| File | Purpose | Dependencies |
|------|---------|--------------|
| `AppShell.tsx` | Main app layout with sidebar, topbar, inspector | TopBar, Sidebar, Inspector, useAppStore |
| `AppShell.module.css` | AppShell styles | — |
| `AuthGuard.tsx` | Route protection, redirects based on auth state | useAuthStore, useRouter |
| `GoogleOAuthProvider.tsx` | Wraps @react-oauth/google Provider | config.auth.googleClientId |
| `Inspector.tsx` | Right panel showing active job details | useAppStore |
| `Inspector.module.css` | Inspector styles | — |
| `PageTransition.tsx` | Framer Motion page transition wrapper | framer-motion, usePathname |
| `Sidebar.tsx` | Left navigation with nav items, user info | useAuthStore, useAppStore, usePathname |
| `Sidebar.module.css` | Sidebar styles | — |
| `TopBar.tsx` | Header bar with logo, user menu, logout | useAuthStore, useAppStore, useRouter |
| `TopBar.module.css` | TopBar styles | — |
| `index.ts` | Barrel export | All layout components |

### `/src/components/job` — Job-Related Components
| File | Purpose | Dependencies |
|------|---------|--------------|
| `ClipGallery.tsx` | Grid display of generated video clips | useJobStore, getMediaUrl, Button |
| `ClipGallery.module.css` | ClipGallery styles | — |
| `JobsList.tsx` | Paginated grid of job cards | useJobs, useRouter, Button |
| `JobsList.module.css` | JobsList styles | — |
| `PipelineTimeline.tsx` | Visual step progress indicator | useJobStore |
| `PipelineTimeline.module.css` | PipelineTimeline styles | — |
| `SubmitPanel.tsx` | Job submission form (URL, duration, count, language, mode) | Input, DualRangeSlider, Button |
| `SubmitPanel.module.css` | SubmitPanel styles | — |
| `TemplateSelector.tsx` | Template/page selection grid grouped by category | usePages |
| `TemplateSelector.module.css` | TemplateSelector styles | — |
| `index.ts` | Barrel export | All job components |

### `/src/components/ui` — UI Primitives
| File | Purpose | Dependencies |
|------|---------|--------------|
| `Button.tsx` | Button component with variants (primary, secondary, ghost, danger) | framer-motion, animations |
| `Button.module.css` | Button styles | — |
| `Input.tsx` | Text input with label, error, icons | — |
| `Input.module.css` | Input styles | — |
| `DualRangeSlider.tsx` | Min/max range slider for duration | — |
| `DualRangeSlider.module.css` | DualRangeSlider styles | — |
| `index.ts` | Barrel export | Button, Input, DualRangeSlider |

---

## `/src/hooks` — Custom React Hooks

| File | Purpose | Key Functions |
|------|---------|---------------|
| `useJobs.ts` | Fetch paginated job list | `fetchJobs()`, `loadMore()`, `refresh()` |
| `useJobSubmit.ts` | Job creation form management | `updateField()`, `togglePage()`, `validate()`, `submit()` |
| `useJobWebSocket.ts` | WebSocket connection + polling + event handling | `connect()`, `fetchJob()`, event handlers |
| `usePages.ts` | Fetch available templates with in-memory caching | Pages cached globally |
| `index.ts` | Barrel export | All hooks |

---

## `/src/lib` — Utilities and Configuration

| File | Purpose | Key Exports |
|------|---------|-------------|
| `config.ts` | Environment configuration | `config`, `endpoints`, `getApiUrl()`, `getWsUrl()`, `getMediaUrl()` |
| `utils.ts` | Helper functions | `cn()`, `formatDuration()`, `formatRelativeTime()`, `isValidYouTubeUrl()`, `debounce()` |
| `animations.ts` | Framer Motion presets | Variants for pages, modals, lists, buttons, etc. |

---

## `/src/services` — API Service Layer

| File | Purpose | Key Functions |
|------|---------|---------------|
| `auth.ts` | Authentication and token management | `exchangeGoogleToken()`, `getCurrentUser()`, `logout()`, `getAuthToken()`, `setAuthToken()`, `clearAuthToken()`, `authFetch()`, `isAllowedDomain()`, `isTokenExpired()`, `getValidAuthToken()` |

---

## `/src/stores` — Zustand Stores

| File | Purpose | Key State |
|------|---------|-----------|
| `auth.ts` | Authentication state | `user`, `isAuthenticated`, `isLoading` + actions |
| `job.ts` | Active job state | `job`, `liveClips`, `wsConnected`, `lastEventAt` + actions |
| `app.ts` | UI state | `isInspectorOpen`, `isSidebarOpen`, `activeJobId` + actions |
| `index.ts` | Barrel export | All stores |

---

## `/src/types` — TypeScript Definitions

| File | Purpose | Key Types |
|------|---------|-----------|
| `index.ts` | Core API types | `User`, `AuthState`, `AuthResponse`, `Job`, `JobStatus`, `JobPhase`, `Clip`, `Page`, `WebSocketEvent`, `ApiResponse`, `ApiError` |
| `job.ts` | Form types | `SubmissionFormData`, `FormErrors`, `SubmissionState`, constants (`DURATION_MIN`, `DURATION_MAX`, etc.) |

---

## `/public` — Static Assets

| File | Purpose |
|------|---------|
| `file.svg` | Generic file icon |
| `globe.svg` | Globe icon |
| `next.svg` | Next.js logo |
| `vercel.svg` | Vercel logo |
| `window.svg` | Window icon |

---

## File Count Summary

| Category | Count |
|----------|-------|
| Pages/Layouts | 12 |
| Components | 18 |
| CSS Modules | 15 |
| Hooks | 5 |
| Stores | 4 |
| Services | 1 |
| Lib Utilities | 3 |
| Types | 2 |
| Config Files | 6 |
| **Total Source Files** | **~66** |
