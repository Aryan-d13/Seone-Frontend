# Error Handling and Edge Cases

> **Confidence:** CONFIRMED | **Source:** Direct code analysis

---

## Error Handling Strategy

Seone uses a **multi-layer error handling** approach:

| Layer         | Responsibility           | Example                    |
| ------------- | ------------------------ | -------------------------- |
| Service Layer | API errors, token expiry | `authFetch()` handles 401  |
| Hooks         | Data fetching errors     | `useJobs` sets error state |
| Stores        | State errors             | `useJobStore.error`        |
| Components    | Display errors           | Error UI rendering         |

---

## API Error Handling

### authFetch Session Expiry

**File:** `src/services/auth.ts`

```typescript
if (response.status === 401) {
  clearAuthToken();
  alert('Session expired. Please log in again.');
  window.location.href = '/login';
  throw new Error('Session expired');
}
```

**Behavior:** Any 401 response triggers logout and redirect. No component-level handling needed.

### Standard Error Parsing

```typescript
if (!response.ok) {
  const error = await response.json().catch(() => ({
    detail: 'Request failed',
  }));
  throw new Error(error.detail || error.message || 'Unknown error');
}
```

**Pattern:** Try to get `detail` field (FastAPI standard), fall back to `message`, then generic.

---

## Hook-Level Error Handling

### useJobs

```typescript
const [state, setState] = useState({
    items: [],
    isLoading: true,
    error: null,  // string | null
});

try {
    const response = await authFetch(...);
    if (!response.ok) throw new Error('Failed to fetch jobs');
    // ...success path
} catch (err) {
    setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch jobs',
    }));
}
```

### useJobWebSocket

```typescript
// Connection errors
ws.onerror = () => {
  console.warn('WebSocket connection failed');
  ws.close();
};

// Auth errors from close codes
if (AUTH_CLOSE_CODES.has(event.code)) {
  setError('Session expired. Please refresh the page or log in again.');
  return;
}

// Max reconnection attempts
if (reconnectAttemptsRef.current >= 5) {
  setError('Connection lost. Please refresh the page.');
}
```

---

## Component Error Display

### JobsList Error State

```tsx
if (error) {
  return (
    <div className={styles.error}>
      <p>{error}</p>
      <Button onClick={() => window.location.reload()} variant="secondary">
        Retry
      </Button>
    </div>
  );
}
```

### Job Detail Page Error States

```tsx
// Ownership/access errors
if (fetchStatus === 'error' && fetchError) {
  return (
    <div className={styles.errorContainer}>
      <div className={styles.errorCard}>
        <h2 className={styles.errorCode}>{fetchError.code}</h2>
        <p className={styles.errorMessage}>{fetchError.message}</p>
        <Button onClick={() => router.push('/dashboard/jobs')} variant="secondary">
          Back to Jobs
        </Button>
      </div>
    </div>
  );
}
```

### HTTP Status Mapping

```typescript
if (!response.ok) {
  const status = response.status;
  if (status === 403) {
    throw { code: 403, message: 'This job does not belong to you.' };
  } else if (status === 404) {
    throw { code: 404, message: 'Job not found.' };
  } else {
    throw { code: status, message: 'Failed to load job.' };
  }
}
```

---

## Form Validation Errors

### useJobSubmit Validation

```typescript
const validate = useCallback((): boolean => {
  const newErrors: FormErrors = {};

  if (!formData.youtubeUrl.trim()) {
    newErrors.youtubeUrl = 'YouTube URL is required';
  } else if (!isValidYouTubeUrl(formData.youtubeUrl)) {
    newErrors.youtubeUrl = 'Please enter a valid YouTube URL';
  }

  if (formData.minDuration >= formData.maxDuration) {
    newErrors.duration = 'Min duration must be less than max duration';
  }

  if (formData.selectedPages.length === 0) {
    newErrors.selectedPages = 'Please select at least one template';
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
}, [formData]);
```

### Field Error Display

```tsx
<Input
  value={formData.youtubeUrl}
  error={errors.youtubeUrl} // Shown below input
/>;

{
  errors.duration && <span className={styles.error}>{errors.duration}</span>;
}
```

---

## Edge Cases

### Empty States

| Scenario      | Component        | Display                         |
| ------------- | ---------------- | ------------------------------- |
| No jobs       | JobsList         | "No jobs found" + Create button |
| No clips yet  | ClipGallery      | Returns `null` (hidden)         |
| No active job | Inspector        | "Select a job to view details"  |
| No templates  | TemplateSelector | Falls back to mock data         |

```tsx
// JobsList empty state
if (items.length === 0) {
  return (
    <div className={styles.empty}>
      <h3>No jobs found</h3>
      <p>Create your first job to get started</p>
      <Button onClick={() => router.push('/dashboard/new')}>Create Job</Button>
    </div>
  );
}
```

### Loading States

```tsx
// Initial loading with skeleton
if (isLoading && items.length === 0) {
  return (
    <div className={styles.grid}>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className={styles.skeleton} />
      ))}
    </div>
  );
}

// Job detail loading
if (fetchStatus === 'loading') {
  return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
      <p>Loading job details...</p>
    </div>
  );
}
```

### Null Guards

Required by CONTRACTS.md:

```tsx
// PipelineTimeline
const job = useJobStore(state => state.job);
if (!job) return null;

// ClipGallery
const clips = liveClips.length > 0 ? liveClips : job?.output?.clips || [];
if (clips.length === 0) return null;

// Job Detail Page
if (!job) return null;
```

### Login Page Session Clear

```typescript
// Clear any existing Google session on mount
useEffect(() => {
  googleLogout();
}, []);
```

**Why?** Prevents using cached Google account; user explicitly chooses account to use.

---

## Error Recovery Patterns

### Retry Mechanism

```tsx
// Manual retry button
<Button onClick={() => window.location.reload()} variant="secondary">
  Retry
</Button>;

// Automatic reconnect (WebSocket)
const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
setTimeout(connect, timeout);
```

### Graceful Degradation

```typescript
// usePages falls back to mock data
} catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to load templates');
    // Fallback mock data for development
    const mockPages: Page[] = [
        { id: '1', name: 'Modern Minimal', ... },
        { id: '2', name: 'Bold Creator', ... },
    ];
    setPages(mockPages);
}
```

### State Reset on Navigation

```typescript
// Job detail page resets store before fetching new job
useEffect(() => {
  reset(); // Clear previous job state
  // ... fetch new job
}, [id]);
```
