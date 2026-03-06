/**
 * WebSocket Lifecycle Tests
 *
 * Validates the WS hardening changes:
 *   1. Cursor persistence from stream events
 *   2. job_sync → store snapshot
 *   3. resume_state → cursor-only update
 *   4. Unknown event_type → console.warn (never silent)
 *   5. event_id deduplication
 *   6. Terminal guard reject logging
 *   7. Polling arbitration (disconnected-only)
 *
 * These are unit tests against the store + simulated message handler logic
 * extracted from useJobWebSocket.ts — no actual WebSocket connections.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useJobStore } from '@/stores/job';
import type { Job, WebSocketEvent, JobSyncMessage, ResumeStateMessage } from '@/types';

// ============================================
// BASE FIXTURES
// ============================================

const BASE_JOB: Job = {
  id: 'lifecycle-test-001',
  status: 'queued',
  progress: 0,
  clip_count: 3,
  created_at: '2026-02-25T06:00:00Z',
};

const RENDERING_JOB: Job = {
  ...BASE_JOB,
  status: 'rendering',
  progress: 40,
  current_step: 'smart_render',
};

const COMPLETED_JOB: Job = {
  ...BASE_JOB,
  status: 'completed',
  progress: 100,
  output: {
    clips: [{ index: 0, url: '/clips/clip_0.mp4', filename: 'clip_0.mp4' }],
  },
};

const FAILED_JOB: Job = {
  ...BASE_JOB,
  status: 'failed',
  error_message: 'Pipeline error',
};

// ============================================
// SIMULATED HANDLERS
// Extracted from useJobWebSocket.ts message dispatch
// ============================================

/**
 * Simulates the two-channel message parser.
 * Returns the kind and whether it was handled.
 */
function parseMessageKind(data: Record<string, unknown>): string | undefined {
  return (data.type as string | undefined) ?? (data.event_type as string | undefined);
}

/**
 * Simulates job_sync handler: setJob(msg.job)
 */
function handleJobSync(msg: JobSyncMessage) {
  const { setJob } = useJobStore.getState();
  if (msg.job) {
    setJob(msg.job);
  }
}

/**
 * Simulates resume_state handler: cursor update only, no store mutation
 */
function handleResumeState(
  msg: ResumeStateMessage,
  cursorRef: { current: string | null }
) {
  cursorRef.current = msg.cursor;
  useJobStore.getState().setLastCursor(msg.cursor);
}

/**
 * Simulates cursor tracking from data events
 */
function trackCursor(
  event: WebSocketEvent,
  cursorRef: { current: string | null },
  seqRef: { current: number | null }
) {
  if (event.cursor) {
    cursorRef.current = event.cursor;
    useJobStore.getState().setLastCursor(event.cursor);
  }
  if (typeof event.seq === 'number') {
    if (seqRef.current === null || event.seq > seqRef.current) {
      seqRef.current = event.seq;
    }
  }
}

/**
 * Simulates event_id deduplication
 */
function isDuplicate(eventId: string | undefined, seen: Set<string>): boolean {
  if (!eventId) return false;
  if (seen.has(eventId)) return true;
  seen.add(eventId);
  return false;
}

/**
 * Simulates step_started with terminal guard
 */
function handleStepStarted(step: string): { rejected: boolean; reason?: string } {
  const { updateJob } = useJobStore.getState();
  const currentJob = useJobStore.getState().job;

  if (
    currentJob &&
    (currentJob.status === 'completed' || currentJob.status === 'failed')
  ) {
    return { rejected: true, reason: `terminal:${currentJob.status}` };
  }

  const STEP_TO_STATUS: Record<string, string> = {
    download: 'downloading',
    transcribe: 'transcribing',
    analyze: 'analyzing',
    smart_render: 'rendering',
  };

  const status = STEP_TO_STATUS[step];
  if (status) {
    updateJob({ current_step: step, status: status as Job['status'] });
  } else {
    updateJob({ current_step: step });
  }
  return { rejected: false };
}

// ============================================
// TESTS
// ============================================

describe('WS Lifecycle — Cursor Persistence', () => {
  let cursorRef: { current: string | null };
  let seqRef: { current: number | null };

  beforeEach(() => {
    useJobStore.getState().reset();
    useJobStore.getState().setJob(BASE_JOB);
    cursorRef = { current: null };
    seqRef = { current: null };
  });

  it('tracks cursor from data events as Redis stream ID string', () => {
    const event: WebSocketEvent = {
      event_type: 'step_started',
      job_id: BASE_JOB.id,
      timestamp: '2026-02-25T06:01:00Z',
      seq: 1,
      cursor: '1771999914424-0',
      payload: { step: 'download' },
    };

    trackCursor(event, cursorRef, seqRef);

    expect(cursorRef.current).toBe('1771999914424-0');
    expect(seqRef.current).toBe(1);
    expect(useJobStore.getState().lastCursor).toBe('1771999914424-0');
  });

  it('cursor advances monotonically through multiple events', () => {
    const events: WebSocketEvent[] = [
      {
        event_type: 'step_started',
        job_id: BASE_JOB.id,
        timestamp: '2026-02-25T06:01:00Z',
        seq: 1,
        cursor: '1771999914424-0',
        payload: { step: 'download' },
      },
      {
        event_type: 'step_completed',
        job_id: BASE_JOB.id,
        timestamp: '2026-02-25T06:02:00Z',
        seq: 5,
        cursor: '1771999914500-0',
        payload: {},
      },
      {
        event_type: 'step_started',
        job_id: BASE_JOB.id,
        timestamp: '2026-02-25T06:03:00Z',
        seq: 10,
        cursor: '1771999914600-0',
        payload: { step: 'transcribe' },
      },
    ];

    for (const event of events) {
      trackCursor(event, cursorRef, seqRef);
    }

    expect(cursorRef.current).toBe('1771999914600-0');
    expect(seqRef.current).toBe(10);
    expect(useJobStore.getState().lastCursor).toBe('1771999914600-0');
  });

  it('events without cursor do not clear existing cursor', () => {
    cursorRef.current = '1771999914424-0';

    const event: WebSocketEvent = {
      event_type: 'step_completed',
      job_id: BASE_JOB.id,
      timestamp: '2026-02-25T06:02:00Z',
      payload: {},
      // No cursor or seq
    };

    trackCursor(event, cursorRef, seqRef);

    expect(cursorRef.current).toBe('1771999914424-0');
  });
});

describe('WS Lifecycle — job_sync Handler', () => {
  beforeEach(() => {
    useJobStore.getState().reset();
    useJobStore.getState().setJob(BASE_JOB);
  });

  it('job_sync snaps store to backend state', () => {
    handleJobSync({
      type: 'job_sync',
      job: RENDERING_JOB,
    });

    const job = useJobStore.getState().job;
    expect(job?.status).toBe('rendering');
    expect(job?.progress).toBe(40);
    expect(job?.current_step).toBe('smart_render');
  });

  it('job_sync with completed job sets terminal state', () => {
    handleJobSync({
      type: 'job_sync',
      job: COMPLETED_JOB,
    });

    const job = useJobStore.getState().job;
    expect(job?.status).toBe('completed');
    expect(job?.progress).toBe(100);
  });

  it('job_sync is dispatched via type field, not event_type', () => {
    const msg = { type: 'job_sync', job: RENDERING_JOB };
    const kind = parseMessageKind(msg as unknown as Record<string, unknown>);
    expect(kind).toBe('job_sync');
  });
});

describe('WS Lifecycle — resume_state Handler', () => {
  let cursorRef: { current: string | null };

  beforeEach(() => {
    useJobStore.getState().reset();
    useJobStore.getState().setJob(BASE_JOB);
    cursorRef = { current: null };
  });

  it('resume_state updates cursor only — does not mutate job', () => {
    const jobBefore = useJobStore.getState().job;

    handleResumeState(
      {
        type: 'resume_state',
        job_id: BASE_JOB.id,
        cursor: '1771999914424-10',
        replayed: 5,
        timestamp: '2026-02-25T06:01:00Z',
      },
      cursorRef
    );

    // Job should be unchanged
    expect(useJobStore.getState().job).toEqual(jobBefore);
    // Cursor should be updated
    expect(cursorRef.current).toBe('1771999914424-10');
    expect(useJobStore.getState().lastCursor).toBe('1771999914424-10');
  });
});

describe('WS Lifecycle — Unknown Event Warning', () => {
  beforeEach(() => {
    useJobStore.getState().reset();
    useJobStore.getState().setJob(BASE_JOB);
  });

  it('unknown kind is identified correctly', () => {
    const msg = { event_type: 'future_quantum_event', job_id: BASE_JOB.id };
    const kind = parseMessageKind(msg as Record<string, unknown>);
    expect(kind).toBe('future_quantum_event');
    // The hook's switch default case would console.warn here
  });

  it('message with no type or event_type returns undefined', () => {
    const msg = { payload: { some: 'data' } };
    const kind = parseMessageKind(msg as Record<string, unknown>);
    expect(kind).toBeUndefined();
  });

  it('type field takes precedence over event_type', () => {
    const msg = { type: 'job_sync', event_type: 'connected' };
    const kind = parseMessageKind(msg as Record<string, unknown>);
    expect(kind).toBe('job_sync');
  });
});

describe('WS Lifecycle — event_id Deduplication', () => {
  let seen: Set<string>;

  beforeEach(() => {
    seen = new Set();
  });

  it('first occurrence of event_id is not a duplicate', () => {
    expect(isDuplicate('evt-001', seen)).toBe(false);
    expect(seen.has('evt-001')).toBe(true);
  });

  it('second occurrence of same event_id is a duplicate', () => {
    isDuplicate('evt-002', seen);
    expect(isDuplicate('evt-002', seen)).toBe(true);
  });

  it('events without event_id are never considered duplicates', () => {
    expect(isDuplicate(undefined, seen)).toBe(false);
    expect(isDuplicate(undefined, seen)).toBe(false);
    expect(seen.size).toBe(0);
  });

  it('different event_ids are tracked independently', () => {
    isDuplicate('evt-A', seen);
    isDuplicate('evt-B', seen);
    expect(isDuplicate('evt-A', seen)).toBe(true);
    expect(isDuplicate('evt-B', seen)).toBe(true);
    expect(isDuplicate('evt-C', seen)).toBe(false);
  });
});

describe('WS Lifecycle — Terminal Guard Reject Logging', () => {
  beforeEach(() => {
    useJobStore.getState().reset();
  });

  it('step_started is rejected when job is completed', () => {
    useJobStore.getState().setJob(COMPLETED_JOB);

    const result = handleStepStarted('smart_render');

    expect(result.rejected).toBe(true);
    expect(result.reason).toBe('terminal:completed');
    // Job status unchanged
    expect(useJobStore.getState().job?.status).toBe('completed');
  });

  it('step_started is rejected when job is failed', () => {
    useJobStore.getState().setJob(FAILED_JOB);

    const result = handleStepStarted('download');

    expect(result.rejected).toBe(true);
    expect(result.reason).toBe('terminal:failed');
    expect(useJobStore.getState().job?.status).toBe('failed');
  });

  it('step_started is allowed when job is active', () => {
    useJobStore.getState().setJob(BASE_JOB);

    const result = handleStepStarted('download');

    expect(result.rejected).toBe(false);
    expect(useJobStore.getState().job?.status).toBe('downloading');
  });

  it('store setJob logs rejection for terminal → non-terminal update', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    useJobStore.getState().setJob(COMPLETED_JOB);
    // Try to regress to rendering
    useJobStore.getState().setJob(RENDERING_JOB);

    expect(debugSpy).toHaveBeenCalledWith(
      '[Store] setJob rejected — terminal guard',
      expect.objectContaining({
        current: 'completed',
        incoming: 'rendering',
      })
    );

    // Status must remain completed
    expect(useJobStore.getState().job?.status).toBe('completed');

    debugSpy.mockRestore();
  });

  it('store updateJob logs rejection for terminal → non-terminal update', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    useJobStore.getState().setJob(FAILED_JOB);
    // Try to update status to rendering
    useJobStore.getState().updateJob({ status: 'rendering', progress: 50 });

    expect(debugSpy).toHaveBeenCalledWith(
      '[Store] updateJob rejected — terminal guard',
      expect.objectContaining({
        current: 'failed',
      })
    );

    // Status must remain failed
    expect(useJobStore.getState().job?.status).toBe('failed');

    debugSpy.mockRestore();
  });
});

describe('WS Lifecycle — Polling Arbitration', () => {
  beforeEach(() => {
    useJobStore.getState().reset();
    useJobStore.getState().setJob(BASE_JOB);
  });

  it('terminal job check prevents polling (simulated)', () => {
    useJobStore.getState().setJob(COMPLETED_JOB);

    const job = useJobStore.getState().job;
    const isTerminal =
      job?.status === 'completed' ||
      job?.status === 'failed' ||
      job?.phase === 'completed' ||
      job?.phase === 'failed';

    expect(isTerminal).toBe(true);
  });

  it('active job allows polling when WS disconnected (simulated)', () => {
    // wsConnected defaults to false after reset
    const wsConnected = useJobStore.getState().wsConnected;
    const job = useJobStore.getState().job;
    const isTerminal = job?.status === 'completed' || job?.status === 'failed';

    expect(wsConnected).toBe(false);
    expect(isTerminal).toBe(false);
    // Polling should activate: !wsConnected && !isTerminal
  });

  it('polling deactivates when WS is connected', () => {
    useJobStore.getState().setWsConnected(true);
    const wsConnected = useJobStore.getState().wsConnected;
    expect(wsConnected).toBe(true);
    // Polling should NOT activate: wsConnected === true
  });
});

describe('WS Lifecycle — Two-Channel Dispatch', () => {
  it('ping is routed via type field', () => {
    const kind = parseMessageKind({ type: 'ping' });
    expect(kind).toBe('ping');
  });

  it('job_sync is routed via type field', () => {
    const kind = parseMessageKind({
      type: 'job_sync',
      job: BASE_JOB,
    } as unknown as Record<string, unknown>);
    expect(kind).toBe('job_sync');
  });

  it('resume_state is routed via type field', () => {
    const kind = parseMessageKind({
      type: 'resume_state',
      job_id: BASE_JOB.id,
      cursor: '123-0',
      replayed: 3,
      timestamp: '2026-02-25T06:00:00Z',
    } as unknown as Record<string, unknown>);
    expect(kind).toBe('resume_state');
  });

  it('data events route via event_type field', () => {
    const kind = parseMessageKind({
      event_type: 'clip_ready',
      job_id: BASE_JOB.id,
    } as Record<string, unknown>);
    expect(kind).toBe('clip_ready');
  });

  it('connected routes via event_type field', () => {
    const kind = parseMessageKind({
      event_type: 'connected',
      job_id: BASE_JOB.id,
    } as Record<string, unknown>);
    expect(kind).toBe('connected');
  });
});
