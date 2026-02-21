/**
 * WebSocket Event Handling Tests
 *
 * Integration tests that simulate WS event sequences against the store.
 * Validates the event handler logic from useJobWebSocket.ts without
 * needing an actual WebSocket connection.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useJobStore } from '@/stores/job';
import type { Job, Clip } from '@/types';

const BASE_JOB: Job = {
  id: 'ws-test-001',
  status: 'queued',
  progress: 0,
  clip_count: 3,
  created_at: '2026-02-10T13:00:00Z',
};

/**
 * Simulates the step_started handler from useJobWebSocket.ts:110-131
 */
function simulateStepStarted(step: string) {
  const { updateJob } = useJobStore.getState();

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
}

/**
 * Simulates the job_completed handler from useJobWebSocket.ts:152-162
 * This is the CURRENT (buggy) behavior — checks output exists but not clips.
 */
function simulateJobCompleted(output: { clips: Clip[] } | undefined) {
  const { updateJob } = useJobStore.getState();

  if (output) {
    updateJob({
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      output,
    });
  }
}

/**
 * Simulates the job_failed handler from useJobWebSocket.ts:165-171
 */
function simulateJobFailed(error: string) {
  const { updateJob } = useJobStore.getState();
  updateJob({
    status: 'failed',
    error_message: error,
  });
}

describe('WS Event Handling — Event Ordering', () => {
  beforeEach(() => {
    useJobStore.getState().reset();
    useJobStore.getState().setJob(BASE_JOB);
  });

  it('job_failed followed by job_completed does not regress to completed', () => {
    // WS delivers job_failed first
    simulateJobFailed('Transcription failed: moved to DLQ');
    expect(useJobStore.getState().job?.status).toBe('failed');

    // Then a stale/buffered job_completed arrives
    simulateJobCompleted({
      clips: [{ index: 0, url: '/clips/clip_0.mp4', filename: 'clip_0.mp4' }],
    });

    // Must remain failed
    expect(useJobStore.getState().job?.status).toBe('failed');
  });

  it('job_failed followed by step_started does not regress', () => {
    simulateJobFailed('Pipeline error');
    expect(useJobStore.getState().job?.status).toBe('failed');

    // Late step_started event (buffered from before failure)
    simulateStepStarted('smart_render');

    // Must remain failed
    expect(useJobStore.getState().job?.status).toBe('failed');
  });

  it('job_completed with clips=[] sets failed, not completed', () => {
    // Job is in rendering state
    simulateStepStarted('smart_render');
    expect(useJobStore.getState().job?.status).toBe('rendering');

    // job_completed arrives with empty clips
    simulateJobCompleted({ clips: [] });

    // Must NOT be completed
    expect(useJobStore.getState().job?.status).not.toBe('completed');
  });
});

describe('WS Event Handling — Clip Accumulation', () => {
  beforeEach(() => {
    useJobStore.getState().reset();
    useJobStore.getState().setJob(BASE_JOB);
  });

  it('clip_ready events accumulate in liveClips', () => {
    const { addClip } = useJobStore.getState();

    addClip({ index: 0, url: '/clips/clip_0.mp4', filename: 'clip_0.mp4' });
    expect(useJobStore.getState().liveClips).toHaveLength(1);

    addClip({ index: 1, url: '/clips/clip_1.mp4', filename: 'clip_1.mp4' });
    expect(useJobStore.getState().liveClips).toHaveLength(2);

    // Duplicate clip (same index) should not add again
    addClip({ index: 0, url: '/clips/clip_0.mp4', filename: 'clip_0.mp4' });
    expect(useJobStore.getState().liveClips).toHaveLength(2);
  });

  it('clips are sorted by index', () => {
    const { addClip } = useJobStore.getState();

    addClip({ index: 2, url: '/clips/clip_2.mp4', filename: 'clip_2.mp4' });
    addClip({ index: 0, url: '/clips/clip_0.mp4', filename: 'clip_0.mp4' });
    addClip({ index: 1, url: '/clips/clip_1.mp4', filename: 'clip_1.mp4' });

    const clips = useJobStore.getState().liveClips;
    expect(clips[0].index).toBe(0);
    expect(clips[1].index).toBe(1);
    expect(clips[2].index).toBe(2);
  });
});

describe('WS Event Handling — Error Preservation', () => {
  beforeEach(() => {
    useJobStore.getState().reset();
    useJobStore.getState().setJob(BASE_JOB);
  });

  it('job_failed error_message is preserved after stale setJob', () => {
    simulateJobFailed('Transcription failed: moved to DLQ');

    expect(useJobStore.getState().job?.error_message).toBe(
      'Transcription failed: moved to DLQ'
    );

    // Stale REST poll via setJob should not clear the error
    useJobStore.getState().setJob({
      ...BASE_JOB,
      status: 'rendering',
      progress: 60,
    });

    // Error must survive (because terminal guard rejects the setJob)
    expect(useJobStore.getState().job?.status).toBe('failed');
    expect(useJobStore.getState().job?.error_message).toBe(
      'Transcription failed: moved to DLQ'
    );
  });
});
