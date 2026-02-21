# Routing and Navigation

> **Confidence:** CONFIRMED | **Source:** Direct code analysis of app/ directory

---

## Next.js App Router Overview

Seone uses **Next.js 16 App Router** with the following key features:

- **Route Groups:** `(auth)` and `(dashboard)` to apply different layouts without affecting URLs
- **Dynamic Routes:** `[id]` for job detail pages
- **Nested Layouts:** Each route group has its own layout wrapping child routes
- **Client Components:** All pages are client-side rendered (marked with `'use client'`)

---

## URL Structure

| URL                    | Page           | Layout Chain                                        | Auth Required |
| ---------------------- | -------------- | --------------------------------------------------- | ------------- |
| `/`                    | Landing page   | RootLayout → PageTransition                         | ❌ No         |
| `/login`               | Login page     | RootLayout → AuthLayout (GoogleOAuth)               | ❌ No         |
| `/dashboard`           | Dashboard home | RootLayout → DashboardLayout (AuthGuard + AppShell) | ✅ Yes        |
| `/dashboard/new`       | Create new job | RootLayout → DashboardLayout                        | ✅ Yes        |
| `/dashboard/jobs`      | Jobs list      | RootLayout → DashboardLayout                        | ✅ Yes        |
| `/dashboard/jobs/{id}` | Job detail     | RootLayout → DashboardLayout                        | ✅ Yes        |

---

## Route Group: `(auth)`

**Purpose:** Public authentication pages that need GoogleOAuthProvider but NOT auth guard.

**File:** `src/app/(auth)/layout.tsx`

```tsx
import { GoogleOAuthProvider } from '@/components/layout/GoogleOAuthProvider';

export default function AuthLayout({ children }) {
  return <GoogleOAuthProvider>{children}</GoogleOAuthProvider>;
}
```

### Simple Explanation

This layout wraps the login page so that Google's OAuth scripts are available. Users can log in without being authenticated (obviously — that's the point of a login page).

### Technical Explanation

- `GoogleOAuthProvider` initializes the `@react-oauth/google` library
- Passes the Google Client ID from environment config
- All child routes automatically have access to `GoogleLogin` component

### Child Routes

| Route    | File                    | Purpose            |
| -------- | ----------------------- | ------------------ |
| `/login` | `(auth)/login/page.tsx` | Google OAuth login |

---

## Route Group: `(dashboard)`

**Purpose:** Protected dashboard pages that require authentication and use the main app layout.

**File:** `src/app/(dashboard)/layout.tsx`

```tsx
import { AuthGuard, AppShell } from '@/components/layout';

export default function DashboardLayout({ children }) {
  return (
    <AuthGuard requireAuth={true} redirectTo="/login">
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
```

### Simple Explanation

This layout adds a security check: if you're not logged in, you get sent to the login page. If you are logged in, you see the main app with a sidebar and top bar.

### Technical Explanation

- `AuthGuard` checks `useAuthStore` for authentication state
- If not authenticated, redirects to `/login`
- If authenticated, renders `AppShell` which includes Sidebar, TopBar, and Inspector
- Children render in the main content area

### Child Routes

| Route                  | File                           | Purpose           |
| ---------------------- | ------------------------------ | ----------------- |
| `/dashboard`           | `dashboard/page.tsx`           | Dashboard home    |
| `/dashboard/new`       | `dashboard/new/page.tsx`       | Job creation form |
| `/dashboard/jobs`      | `dashboard/jobs/page.tsx`      | Jobs history list |
| `/dashboard/jobs/{id}` | `dashboard/jobs/[id]/page.tsx` | Job detail view   |

---

## Layout Hierarchy Diagram

```
src/app/layout.tsx (ROOT)
├── Fonts: Inter, JetBrains Mono
├── globals.css imported
├── <html lang="en" className="dark">
└── <PageTransition>
    │
    ├── src/app/page.tsx
    │   └── Landing Page (/)
    │
    ├── src/app/(auth)/layout.tsx
    │   └── <GoogleOAuthProvider>
    │       └── src/app/(auth)/login/page.tsx
    │           └── Login Page (/login)
    │
    └── src/app/(dashboard)/layout.tsx
        └── <AuthGuard>
            └── <AppShell>
                │
                ├── <TopBar />
                ├── <Sidebar />
                ├── <main>  ← Children render here
                └── <Inspector />
                    │
                    ├── src/app/(dashboard)/dashboard/page.tsx
                    │   └── Dashboard (/dashboard)
                    │
                    ├── src/app/(dashboard)/dashboard/new/page.tsx
                    │   └── New Job (/dashboard/new)
                    │
                    ├── src/app/(dashboard)/dashboard/jobs/page.tsx
                    │   └── Jobs List (/dashboard/jobs)
                    │
                    └── src/app/(dashboard)/dashboard/jobs/[id]/page.tsx
                        └── Job Detail (/dashboard/jobs/{id})
```

---

## Navigation Components

### Sidebar Navigation

**File:** `src/components/layout/Sidebar.tsx`

**Navigation Items:**

```tsx
const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: <GridIcon /> },
  { label: 'New Job', href: '/dashboard/new', icon: <PlusIcon /> },
  { label: 'Jobs History', href: '/dashboard/jobs', icon: <ClockIcon /> },
];
```

**Active State Logic:**

```tsx
const isActive =
  pathname === item.href ||
  (item.href !== '/dashboard' && pathname.startsWith(item.href));
```

### Simple Explanation

The sidebar shows three links. The current page is highlighted. "Dashboard" is only highlighted when you're exactly on `/dashboard`, but "Jobs History" is highlighted for `/dashboard/jobs` AND `/dashboard/jobs/123`.

### Technical Explanation

- `usePathname()` from Next.js gives current URL path
- Exact match for dashboard root (avoids highlighting for all dashboard routes)
- Prefix match for other routes (job detail pages highlight "Jobs History")
- Active indicator uses Framer Motion `layoutId` for smooth animation

### TopBar Navigation

**File:** `src/components/layout/TopBar.tsx`

- **Logo:** Links to dashboard (visual only, no click handler)
- **Inspector Toggle:** Shows/hides right panel
- **User Avatar:** Shows user picture from Google
- **Logout Button:** Calls `logout()` and redirects to `/login`

---

## Programmatic Navigation

### Router Usage

All programmatic navigation uses Next.js `useRouter`:

```tsx
import { useRouter } from 'next/navigation';

function Component() {
  const router = useRouter();

  // Navigate to new page
  router.push('/dashboard/jobs/123');

  // Replace current URL (no back button)
  router.replace('/login');
}
```

### Navigation Patterns by Action

| Action               | Method             | Destination            |
| -------------------- | ------------------ | ---------------------- |
| After login          | `router.replace()` | `/dashboard`           |
| After logout         | `router.replace()` | `/login`               |
| Create job success   | `router.push()`    | `/dashboard/jobs/{id}` |
| Click job card       | `router.push()`    | `/dashboard/jobs/{id}` |
| Back from job detail | `router.push()`    | `/dashboard/jobs`      |
| Click sidebar nav    | `<Link>` component | Various                |

---

## Page Transitions

**File:** `src/components/layout/PageTransition.tsx`

Wraps all pages in Framer Motion `AnimatePresence`:

```tsx
export function PageTransition({ children }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

**Animation Effect:**

- **Enter:** Fade in + slide up from y: 20
- **Exit:** Fade out + slide up to y: -20
- **Duration:** 300ms with easeOut curve

---

## Dynamic Route Parameters

### Job Detail Page: `[id]`

**File:** `src/app/(dashboard)/dashboard/jobs/[id]/page.tsx`

**Next.js 15+ Pattern:** Route params are now a Promise:

```tsx
interface JobDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = use(params); // React.use() to unwrap Promise

  // Use id for API calls, WebSocket, etc.
}
```

### Simple Explanation

The `[id]` folder name tells Next.js this is a dynamic segment. Whatever you put in the URL (like `abc123`) becomes available as `id`.

### Technical Explanation

- `use()` is a React 19 hook for unwrapping Promises in render
- This pattern is required in Next.js 15+ App Router
- The `id` is used to fetch job data and connect to WebSocket
