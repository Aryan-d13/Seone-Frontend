/**
 * Polling Termination Tests
 * 
 * Validates that polling stops on terminal states and that
 * stale REST responses don't regress terminal states.
 * Uses Vitest fake timers.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useJobStore } from '@/stores/job';
import type { Job } from '@/types';

const BASE_JOB: Job = {
    id: 'poll-test-001',
    status: 'queued',
    progress: 0,
    clip_count: 3,
    created_at: '2026-02-10T13:00:00Z',
};

const completedJob: Job = {
    ...BASE_JOB,
    status: 'completed',
    progress: 100,
    output: {
        clips: [
            { index: 0, url: '/clips/clip_0.mp4', filename: 'clip_0.mp4' },
        ],
    },
};

const failedJob: Job = {
    ...BASE_JOB,
    status: 'failed',
    error_message: 'Transcription failed',
};

const renderingJob: Job = {
    ...BASE_JOB,
    status: 'rendering',
    progress: 60,
};

/**
 * Simulates the polling termination logic from useJobWebSocket.ts:250
 * ```
 * const isTerminal = job?.status === 'completed' || job?.status === 'failed'
 *                 || job?.phase === 'completed' || job?.phase === 'failed';
 * if (isTerminal) return;
 * ```
 */
function isTerminalForPolling(job: Job | null): boolean {
    if (!job) return false;
    return (
        job.status === 'completed' ||
        job.status === 'failed' ||
        job.phase === 'completed' ||
        job.phase === 'failed'
    );
}

describe('Polling Termination', () => {
    beforeEach(() => {
        useJobStore.getState().reset();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('polling stops when status is completed', () => {
        const { setJob } = useJobStore.getState();
        setJob(completedJob);

        const job = useJobStore.getState().job;
        expect(isTerminalForPolling(job)).toBe(true);
    });

    it('polling stops when status is failed', () => {
        const { setJob } = useJobStore.getState();
        setJob(failedJob);

        const job = useJobStore.getState().job;
        expect(isTerminalForPolling(job)).toBe(true);
    });

    it('polling stops when phase is completed', () => {
        const { setJob } = useJobStore.getState();
        setJob({ ...BASE_JOB, status: 'completed', phase: 'completed', progress: 100, output: { clips: [{ index: 0, url: '/c.mp4', filename: 'c.mp4' }] } });

        const job = useJobStore.getState().job;
        expect(isTerminalForPolling(job)).toBe(true);
    });

    it('polling stops when phase is failed', () => {
        const { setJob } = useJobStore.getState();
        setJob({ ...BASE_JOB, status: 'failed', phase: 'failed' });

        const job = useJobStore.getState().job;
        expect(isTerminalForPolling(job)).toBe(true);
    });

    it('polling does not restart after terminal state', () => {
        const { setJob } = useJobStore.getState();

        // Go through lifecycle: queued → rendering → completed
        setJob(BASE_JOB);
        expect(isTerminalForPolling(useJobStore.getState().job)).toBe(false);

        setJob(renderingJob);
        expect(isTerminalForPolling(useJobStore.getState().job)).toBe(false);

        setJob(completedJob);
        expect(isTerminalForPolling(useJobStore.getState().job)).toBe(true);

        // Simulate: after terminal, a new setJob call should not "restart" polling
        // by changing status back to non-terminal
        setJob(renderingJob);

        // Status must remain terminal (completed) due to monotonicity
        expect(isTerminalForPolling(useJobStore.getState().job)).toBe(true);
    });

    it('stale poll response does not regress terminal state', () => {
        const { setJob } = useJobStore.getState();

        // Job fails via WS
        setJob(failedJob);
        expect(useJobStore.getState().job?.status).toBe('failed');

        // Stale REST response from poll initiated BEFORE failure arrives
        // It carries the old "rendering" state
        setJob(renderingJob);

        // Must remain failed
        expect(useJobStore.getState().job?.status).toBe('failed');
        expect(isTerminalForPolling(useJobStore.getState().job)).toBe(true);
    });
});
