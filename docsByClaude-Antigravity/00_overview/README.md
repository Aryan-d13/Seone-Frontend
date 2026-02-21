# Seone Frontend Documentation

> **Status:** Complete | **Last Updated:** 2026-01-19  
> **Audience:** Developers new to the codebase, from freshers to senior engineers

---

## What is Seone?

**Seone** is an **AI-powered video processing platform** that transforms YouTube videos into short-form content clips. The frontend is the user-facing application that allows users to:

1. **Submit YouTube URLs** for processing
2. **Configure clip parameters** (duration, count, templates, language)
3. **Monitor job progress** in real-time via WebSocket
4. **Download generated clips** when processing completes

### Simple Explanation

Think of Seone as a "video factory control panel." You give it a YouTube link, tell it how many clips you want and how long they should be, pick a template style, and hit submit. The backend does the heavy lifting (downloading, transcribing, analyzing, rendering), while the frontend shows you what's happening and displays your clips when they're ready.

### Technical Explanation

The frontend is a **Next.js 16 App Router application** using:

- **React 19** for UI
- **Zustand** for state management
- **Framer Motion** for animations
- **CSS Modules** for styling
- **WebSocket + REST polling** for real-time updates

### Why This Matters in Production

The frontend is the **only part users see**. If it fails to show job progress, users think the system is broken. If it doesn't handle auth properly, they can't access their jobs. If loading states are missing, the UI feels janky. This documentation ensures engineers understand exactly how every piece works.

---

## Documentation Structure

This documentation follows a **production-grade hierarchy**:

| Folder                                | Purpose                                             |
| ------------------------------------- | --------------------------------------------------- |
| `00_overview/`                        | This file — high-level introduction                 |
| `01_frontend_architecture/`           | Technology stack, patterns, design decisions        |
| `02_repository_map/`                  | Complete file-by-file inventory                     |
| `03_routing_and_navigation/`          | Next.js App Router structure, route groups          |
| `04_state_management/`                | Zustand stores, data flow, persistence              |
| `05_api_and_backend_integration/`     | REST endpoints, request/response contracts          |
| `06_real_time_updates/`               | WebSocket implementation, reconnection, polling     |
| `07_authentication_and_sessions/`     | Google OAuth, JWT handling, session management      |
| `08_ui_components_and_design_system/` | Component library, CSS variables, animations        |
| `09_error_handling_and_edge_cases/`   | Error states, recovery, user feedback               |
| `10_performance_and_loading_states/`  | Loading indicators, skeleton screens, optimizations |
| `11_environment_and_configuration/`   | Environment variables, config management            |
| `12_accessibility_and_ux_decisions/`  | A11y considerations, UX patterns                    |
| `13_known_limitations_and_risks/`     | Current gaps, known issues, future improvements     |

---

## Quick Start for New Developers

### 1. Installation

```bash
cd Seone-Frontend
npm install
```

### 2. Environment Setup

Create `.env.local` with:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
NEXT_PUBLIC_DATA_URL=http://localhost:8000/data
```

### 3. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## Key User Flows

### 1. Login Flow

```
Landing Page → Login Page → Google OAuth → Token Exchange → Dashboard
```

- Only `@creativefuel.io` domain is allowed
- JWT stored in secure cookie
- User info persisted in sessionStorage via Zustand

### 2. Job Creation Flow

```
Dashboard → New Job Page → Fill Form → Select Templates → Submit → Job Detail Page
```

- YouTube URL validation happens client-side
- Form data validated before submission
- On success, redirected to job detail page with WebSocket connection

### 3. Job Monitoring Flow

```
Job Detail Page → WebSocket Connect → Receive Events → Update UI → REST Reconciliation
```

- WebSocket provides real-time step/clip updates
- REST polling every 3 seconds ensures state convergence
- On job completion, final REST fetch reconciles all data

---

## Frontend-Backend Contract Summary

| Frontend Action | Backend Endpoint                   | Key Contract               |
| --------------- | ---------------------------------- | -------------------------- |
| Login           | `POST /api/v1/auth/google?token=`  | Returns `access_token`     |
| Get User        | `GET /api/v1/auth/me`              | Returns `User` object      |
| List Jobs       | `GET /api/v1/jobs?page=&per_page=` | Returns paginated job list |
| Create Job      | `POST /api/v1/jobs`                | Returns `{ id, ws_url }`   |
| Get Job         | `GET /api/v1/jobs/{id}`            | Returns full job details   |
| WebSocket       | `WS /ws/jobs/{id}?token=`          | Real-time events           |

See `05_api_and_backend_integration/` for complete contracts.

---

## State Contracts

The frontend has documented invariants in `CONTRACTS.md`:

| Invariant           | Guarantee                                                  |
| ------------------- | ---------------------------------------------------------- |
| `items: Job[]`      | Always an array, never undefined                           |
| `job: Job \| null`  | Null is valid transitional state; components must handle   |
| `liveClips: Clip[]` | Always an array                                            |
| Store reset         | Synchronous; components will render during reset→fetch gap |

**Violations of these contracts are bugs**, not expected behavior.

---

## Next Steps

1. Start with `01_frontend_architecture/` to understand the overall structure
2. Read `03_routing_and_navigation/` to understand URL patterns
3. Study `04_state_management/` before touching any stores
4. Review `06_real_time_updates/` before modifying WebSocket logic
