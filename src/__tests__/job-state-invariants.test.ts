/**
 * Job State Invariant Tests
 *
 * Pure unit tests against the Zustand store.
 * These test the 5 required invariants:
 *   INV-1: No COMPLETED with empty clips
 *   INV-2: Terminal monotonicity (failed/completed cannot be regressed)
 *   INV-5: Error state durability under terminal-failed
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useJobStore } from '@/stores/job';
import type { Job } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_JOB: Job = {
  id: 'test-job-001',
  status: 'queued',
  progress: 0,
  clip_count: 3,
  created_at: '2026-02-10T13:00:00Z',
};

const failedJob: Job = {
  ...BASE_JOB,
  status: 'failed',
  error_message: 'Transcription failed: DLQ',
};

const completedJobWithClips: Job = {
  ...BASE_JOB,
  status: 'completed',
  progress: 100,
  completed_at: '2026-02-10T13:10:00Z',
  output: {
    clips: [
      { index: 0, url: '/clips/clip_0.mp4', filename: 'clip_0.mp4' },
      { index: 1, url: '/clips/clip_1.mp4', filename: 'clip_1.mp4' },
    ],
  },
};

const renderingJob: Job = {
  ...BASE_JOB,
  status: 'rendering',
  progress: 60,
  current_step: 'smart_render',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Job Store — Terminal Monotonicity (INV-2)', () => {
  beforeEach(() => {
    useJobStore.getState().reset();
  });

  it('setJob must not overwrite failed with completed', () => {
    const { setJob } = useJobStore.getState();

    // Establish failed state
    setJob(failedJob);
    expect(useJobStore.getState().job?.status).toBe('failed');

    // Stale REST poll returns completed
    setJob(completedJobWithClips);

    // Must remain failed
    expect(useJobStore.getState().job?.status).toBe('failed');
  });

  it('setJob must not overwrite failed with rendering', () => {
    const { setJob } = useJobStore.getState();

    setJob(failedJob);
    expect(useJobStore.getState().job?.status).toBe('failed');

    // Stale REST poll returns rendering
    setJob(renderingJob);

    expect(useJobStore.getState().job?.status).toBe('failed');
  });

  it('setJob must not overwrite completed with rendering', () => {
    const { setJob } = useJobStore.getState();

    setJob(completedJobWithClips);
    expect(useJobStore.getState().job?.status).toBe('completed');

    // Stale REST poll returns rendering
    setJob(renderingJob);

    expect(useJobStore.getState().job?.status).toBe('completed');
  });

  it('updateJob must not regress from failed to any non-terminal status', () => {
    const { setJob, updateJob } = useJobStore.getState();

    setJob(failedJob);
    expect(useJobStore.getState().job?.status).toBe('failed');

    // Late step_started WS event tries to set rendering
    updateJob({ status: 'rendering', current_step: 'smart_render' });

    expect(useJobStore.getState().job?.status).toBe('failed');
  });

  it('updateJob must not regress from completed to any state', () => {
    const { setJob, updateJob } = useJobStore.getState();

    setJob(completedJobWithClips);
    expect(useJobStore.getState().job?.status).toBe('completed');

    // Late WS event tries to change status
    updateJob({ status: 'rendering' });

    expect(useJobStore.getState().job?.status).toBe('completed');
  });

  it('failed overrides stale completed from REST', () => {
    const { setJob } = useJobStore.getState();

    // Scenario: REST returns completed (stale), then failed arrives
    setJob(completedJobWithClips);
    expect(useJobStore.getState().job?.status).toBe('completed');

    // Failed must override completed (failed is "more terminal")
    setJob(failedJob);
    expect(useJobStore.getState().job?.status).toBe('failed');

    // Now a second stale completed must NOT override failed
    setJob(completedJobWithClips);
    expect(useJobStore.getState().job?.status).toBe('failed');
  });
});

describe('Job Store — No COMPLETED with Empty Clips (INV-1)', () => {
  beforeEach(() => {
    useJobStore.getState().reset();
  });

  it('job_completed with empty clips must not set completed', () => {
    const { setJob, updateJob } = useJobStore.getState();

    // Job is in rendering state
    setJob(renderingJob);

    // job_completed handler does: updateJob({ status: 'completed', output: { clips: [] } })
    updateJob({
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      output: { clips: [] },
    });

    // Must NOT be completed — should be failed or remain rendering
    expect(useJobStore.getState().job?.status).not.toBe('completed');
  });

  it('job_completed with valid clips sets completed', () => {
    const { setJob, updateJob } = useJobStore.getState();

    setJob(renderingJob);

    updateJob({
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      output: {
        clips: [{ index: 0, url: '/clips/clip_0.mp4', filename: 'clip_0.mp4' }],
      },
    });

    expect(useJobStore.getState().job?.status).toBe('completed');
  });
});

describe('Job Store — Error State Durability (INV-5)', () => {
  beforeEach(() => {
    useJobStore.getState().reset();
  });

  it('setJob must not clear error when state is terminal-failed', () => {
    const { setJob, setError } = useJobStore.getState();

    // Establish failed state with an error
    setJob(failedJob);
    setError('Transcription failed: DLQ');

    expect(useJobStore.getState().error).toBe('Transcription failed: DLQ');

    // Stale REST poll calls setJob — error must survive
    setJob({ ...renderingJob }); // This should be rejected by terminal guard

    expect(useJobStore.getState().error).toBe('Transcription failed: DLQ');
    expect(useJobStore.getState().job?.status).toBe('failed');
  });
});
