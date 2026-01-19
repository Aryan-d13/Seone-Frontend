# Real-Time Updates

> **Confidence:** CONFIRMED | **Source:** Direct code analysis of useJobWebSocket.ts

---

## Overview

Seone uses **WebSocket + REST polling** for real-time job updates:

| Mechanism | Purpose | Frequency |
|-----------|---------|-----------|
| WebSocket | Real-time events (step changes, clips) | Event-driven |
| REST Polling | State reconciliation | Every 3 seconds |
| REST Fetch | Initial load, final reconciliation | On mount, on job_completed |

This hybrid approach ensures the frontend always converges to the correct state, even if WebSocket events are missed.

---

## WebSocket Architecture

**File:** `src/hooks/useJobWebSocket.ts`

### Connection URL

```typescript
const wsUrl = `${getWsUrl(endpoints.ws.job(jobId))}?token=${encodeURIComponent(token)}`;
// Example: ws://localhost:8000/ws/jobs/abc123?token=eyJ...
```

**Protocol:** `ws://` (development) or `wss://` (production)
**Authentication:** JWT passed as query parameter `?token=`

### Connection Lifecycle

```
1. Component Mounts → useJobWebSocket(jobId) called
2. Check auth token → If expired, show error, don't connect
3. Create WebSocket → new WebSocket(wsUrl)
4. onopen → Set connected, reset reconnect counter, fetch REST snapshot
5. onmessage → Parse event, update store
6. onclose → Handle reconnection
7. onerror → Log warning, close socket
8. Component Unmounts → Close socket, clear timeouts
```

---

## Event Types

### `connected`
**When:** Immediately after WebSocket opens
**Payload:** `{ message: "Connected to job {id}" }`
**Action:** Log to console (no state change)

### `step_started`
**When:** Worker begins a processing step
**Payload:** `{ step: "download" | "transcribe" | "analyze" | "smart_render" }`
**Action:** Update `job.current_step` and `job.status`

```typescript
case 'step_started':
    const step = data.payload.step;
    let status;
    switch (step) {
        case 'smart_render': status = 'rendering'; break;
        case 'transcribe': status = 'transcribing'; break;
        case 'analyze': status = 'analyzing'; break;
        case 'download': status = 'downloading'; break;
    }
    updateJob({ current_step: step, status });
```

### `step_completed`
**When:** Worker finishes a processing step
**Payload:** `{ step: "download" }`
**Action:** Currently no-op (could be used for visual feedback)

### `clip_ready`
**When:** A single clip is rendered
**Payload:**
```json
{
    "clip_index": 0,
    "clip_url": "/clips/job-id/clip_0.mp4",
    "clips_ready": 1,
    "clip_count": 3
}
```
**Action:** Add clip to `liveClips`, update progress

```typescript
case 'clip_ready':
    const clip = {
        index: data.payload.clip_index,
        url: data.payload.clip_url,
        filename: data.payload.clip_url.split('/').pop()
    };
    addClip(clip);
    updateJob({
        progress: (data.payload.clips_ready / data.payload.clip_count) * 100
    });
```

### `job_completed`
**When:** All clips are rendered
**Payload:**
```json
{
    "output": {
        "clips": [
            { "index": 0, "url": "...", "filename": "..." },
            ...
        ]
    }
}
```
**Action:** Update status to completed, set progress to 100, fetch REST for final reconciliation

```typescript
case 'job_completed':
    updateJob({
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
        output: data.payload.output
    });
    fetchJob();  // REST reconciliation
```

### `job_failed`
**When:** Job processing fails
**Payload:** `{ error: "Error message" }`
**Action:** Update status to failed, store error message, close socket

```typescript
case 'job_failed':
    updateJob({
        status: 'failed',
        error_message: data.payload.error
    });
    ws.close();
```

---

## Authentication Handling

### Token Validation Before Connect

```typescript
const token = getValidAuthToken(60);  // 60 second buffer
if (!token) {
    setError('Session expired. Please refresh the page or log in again.');
    setWsConnected(false);
    return;
}
```

**Why Buffer?** If token expires during connection, the WebSocket will be rejected. The 60-second buffer ensures we don't attempt connections with nearly-expired tokens.

### Auth-Related Close Codes

```typescript
const AUTH_CLOSE_CODES = new Set([
    4001,  // Custom: Unauthorized
    4003,  // Custom: Forbidden
    1008,  // Policy Violation (standard)
]);
```

When WebSocket closes with these codes:
1. Set `needsAuthRef.current = true`
2. Check if token is still valid
3. If expired → Show error, don't reconnect
4. If valid → Try reconnect (backend might have temporary issue)

---

## Reconnection Logic

```typescript
ws.onclose = (event) => {
    setWsConnected(false);
    
    // Don't reconnect on normal closure
    if (event.code === 1000) return;
    
    // Don't reconnect after max attempts
    if (reconnectAttemptsRef.current >= 5) {
        setError('Connection lost. Please refresh the page.');
        return;
    }
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 10s (capped)
    const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
    reconnectAttemptsRef.current++;
    
    setTimeout(connect, timeout);
};
```

### Simple Explanation
If the connection drops unexpectedly, we try again. Each retry waits longer (1 second, then 2, then 4...) to avoid hammering the server. After 5 tries, we give up and tell the user to refresh.

### Technical Explanation
- `reconnectAttemptsRef` tracks retry count
- Exponential backoff with 10s cap
- Refs used instead of state to avoid dependency issues
- `mountedRef` prevents state updates after unmount

---

## REST Polling

### Why Poll?

WebSocket events can be missed:
- Late connection (job started before WS connected)
- Network interruption
- Server restart
- Browser tab throttling

Polling ensures eventual consistency.

### Polling Implementation

```typescript
useEffect(() => {
    if (!jobId || !mountedRef.current) return;
    
    // Stop polling for terminal jobs
    const isTerminal = job?.status === 'completed' || 
                       job?.status === 'failed' || 
                       job?.phase === 'completed' || 
                       job?.phase === 'failed';
    if (isTerminal) return;
    
    const intervalId = setInterval(() => {
        if (mountedRef.current) {
            fetchJob();
        }
    }, 3000);
    
    return () => clearInterval(intervalId);
}, [jobId, job?.status, job?.phase, fetchJob]);
```

### Polling Rules
1. Poll every 3 seconds while job is active
2. Stop polling when job reaches terminal state
3. Polling continues even if WebSocket is connected (redundancy)
4. Each poll calls `setJob()` which merges clips

---

## State Precedence

```
REST  → Initial snapshot (authoritative on mount)
WS    → Transitions (authoritative during session)
REST  → Final reconciliation on job_completed
```

### Last-Write-Wins

```typescript
// No timestamp comparison — last write wins
updateJob(updates);  // Just shallow merge
```

**Why?** Simplicity. Both REST and WS are authoritative sources. Conflicts are rare and resolve quickly due to polling.

### Known Race Windows

| Race | Impact | Mitigation |
|------|--------|------------|
| WS before REST completes | WS applied to stale state | fetchStatus gates WS connection |
| REST returns after WS update | REST overwrites | Acceptable; final state is correct |
| Clip arrives before job data | Clip stored in liveClips | Rendered when job data arrives |

---

## Conditional Connection

The WebSocket only connects for active jobs:

```typescript
const shouldConnect = 
    fetchStatus === 'success' && 
    job && 
    job.status !== 'completed' && 
    job.status !== 'failed';

useJobWebSocket(shouldConnect ? id : '');
```

**Why?**
- No point connecting for completed jobs
- Failed jobs won't send more events
- Saves server resources

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     JOB DETAIL PAGE MOUNT                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ reset() store     │
                    │ fetchJob() REST   │
                    └───────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
            ┌───────────────┐   ┌───────────────────┐
            │ setJob(data)  │   │ setFetchStatus    │
            │ Merge clips   │   │ ('success')       │
            └───────────────┘   └───────────────────┘
                    │                   │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ Is job terminal?  │
                    │ (completed/failed)│
                    └───────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │ NO                            │ YES
              ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐
    │ Connect WebSocket│             │ Skip WebSocket  │
    │ Start polling   │             │ Skip polling    │
    └─────────────────┘             └─────────────────┘
              │
              ▼
    ┌─────────────────────────────────────────────┐
    │          REAL-TIME UPDATE LOOP              │
    ├─────────────────────────────────────────────┤
    │                                             │
    │  ┌───────────────┐    ┌───────────────────┐ │
    │  │ WS Events     │    │ REST Polling      │ │
    │  │ (immediate)   │    │ (every 3s)        │ │
    │  └───────┬───────┘    └─────────┬─────────┘ │
    │          │                      │           │
    │          │    ┌─────────────────┘           │
    │          │    │                             │
    │          ▼    ▼                             │
    │    ┌───────────────────┐                    │
    │    │ updateJob()       │                    │
    │    │ addClip()         │                    │
    │    │ setJob()          │                    │
    │    └───────────────────┘                    │
    │                                             │
    └─────────────────────────────────────────────┘
              │
              │ job_completed event
              ▼
    ┌─────────────────┐
    │ Final REST fetch│
    │ Stop polling    │
    │ Close WebSocket │
    └─────────────────┘
```

---

## Protocol Validation

**File:** `src/lib/config.ts`

On module load, validates WebSocket protocol matches page security:

```typescript
function validateWsConfig(): void {
    if (typeof window === 'undefined') return;

    const isSecurePage = window.location.protocol === 'https:';
    const isSecureWs = config.ws.baseUrl.startsWith('wss://');

    if (isSecurePage && !isSecureWs) {
        console.error(
            '[FATAL CONFIG] Secure page (https) attempting non-secure WebSocket (ws://).'
        );
    }
}
```

**Why?** HTTPS pages cannot connect to ws:// (mixed content). This catches misconfiguration at startup.
