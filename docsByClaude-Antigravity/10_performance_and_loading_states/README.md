# Performance and Loading States

> **Confidence:** CONFIRMED | **Source:** Direct code analysis

---

## Loading State Patterns

### Skeleton Screens

Used for initial data loading:

```tsx
// JobsList skeleton
if (isLoading && items.length === 0) {
  return (
    <div className={styles.grid}>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className={styles.skeleton} />
      ))}
    </div>
  );
}

// TemplateSelector skeleton
if (isLoading) {
  return (
    <div className={styles.grid}>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className={styles.skeleton} />
      ))}
    </div>
  );
}
```

### Spinner Loading

Used for focused actions:

```tsx
// Job detail page loading
if (fetchStatus === 'loading') {
  return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
      <p>Loading job details...</p>
    </div>
  );
}

// Auth guard loading
if (isLoading) {
  return (
    <div className="auth-loading">
      <div className="auth-loading-spinner" />
    </div>
  );
}
```

### Button Loading State

```tsx
<Button isLoading={state.isSubmitting} disabled={state.isSubmitting}>
  {state.isSubmitting ? 'Creating Job...' : 'Create Job'}
</Button>
```

**Inside Button component:**

```tsx
{
  isLoading && (
    <span className={styles.spinner}>
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" strokeDasharray="32">
          <animate
            attributeName="stroke-dashoffset"
            values="32;0"
            dur="1s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </span>
  );
}
```

---

## Data Fetching Optimizations

### Pages Cache

**File:** `src/hooks/usePages.ts`

```typescript
// Module-level cache (survives component unmounts)
let pagesCache: Page[] | null = null;

export function usePages() {
    const [pages, setPages] = useState<Page[]>(pagesCache || []);
    const [isLoading, setIsLoading] = useState(!pagesCache);

    useEffect(() => {
        if (pagesCache) {
            setIsLoading(false);
            return;  // Skip fetch, use cache
        }

        async function fetchPages() {
            const data = await fetch(...);
            pagesCache = data;  // Cache for future
            setPages(data);
        }
        fetchPages();
    }, []);
}
```

**Effect:** Templates only fetched once per session.

### Selective Zustand Subscriptions

```tsx
// ✅ Only re-render when specific value changes
const job = useJobStore(state => state.job);
const liveClips = useJobStore(state => state.liveClips);

// ❌ Re-renders on ANY store change
const store = useJobStore();
```

### Conditional WebSocket

```typescript
const shouldConnect =
  fetchStatus === 'success' &&
  job &&
  job.status !== 'completed' &&
  job.status !== 'failed';

useJobWebSocket(shouldConnect ? id : '');
```

**Effect:** No WebSocket for completed/failed jobs. Saves server resources.

### Polling Auto-Stop

```typescript
useEffect(() => {
  const isTerminal = job?.status === 'completed' || job?.status === 'failed';
  if (isTerminal) return; // Don't setup interval

  const intervalId = setInterval(fetchJob, 3000);
  return () => clearInterval(intervalId);
}, [job?.status, job?.phase]);
```

**Effect:** Polling stops when job reaches terminal state.

---

## Animation Performance

### GPU-Accelerated Transforms

```typescript
// Uses transform instead of top/left
export const slideUpVariants: Variants = {
  initial: { opacity: 0, y: 20 }, // translateY
  animate: { opacity: 1, y: 0 },
};
```

### Staggered List Rendering

```typescript
export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.05, // 50ms between items
      delayChildren: 0.1,
    },
  },
};
```

**Effect:** Items animate one at a time, preventing frame drops from parallel animations.

### Layout Animations

```tsx
// Smooth sidebar/inspector size transitions
<motion.aside
    animate={{
        width: isInspectorOpen ? 'var(--inspector-width)' : 0,
        opacity: isInspectorOpen ? 1 : 0,
    }}
    transition={{ duration: 0.2 }}
>
```

---

## Progress Indicators

### Pipeline Timeline

Visual progress through job steps:

```tsx
const STEPS = [
  { id: 'queued', label: 'Queued' },
  { id: 'downloading', label: 'Downloading' },
  { id: 'transcribing', label: 'Transcribing' },
  { id: 'analyzing', label: 'Analyzing' },
  { id: 'rendering', label: 'Rendering' },
];

// Determine which steps are done
const effectiveIndex = isCompleted ? STEPS.length : currentStepIndex;
const isDone = index < effectiveIndex;
```

### Progress Bar

```tsx
{
  ['downloading', 'transcribing', 'analyzing', 'rendering'].includes(job.status) && (
    <div className={styles.progress}>
      <div className={styles.progressBar} style={{ width: `${job.progress}%` }} />
    </div>
  );
}
```

---

## Memory Management

### Ref Cleanup

```typescript
// WebSocket cleanup on unmount
useEffect(() => {
  mountedRef.current = true;
  connect();

  return () => {
    mountedRef.current = false;
    if (wsRef.current) {
      wsRef.current.close(1000, 'Component unmounting');
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
  };
}, [connect]);
```

### Store Reset on Navigation

```typescript
// Job detail page
useEffect(() => {
  reset(); // Clear previous job data
  fetchJob();
}, [id]);
```

**Effect:** Old job data doesn't pollute new job view.

---

## Font Loading

**File:** `src/app/layout.tsx`

```typescript
const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap', // Show fallback font until loaded
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});
```

**`display: "swap"`:** Prevents invisible text during font load.
