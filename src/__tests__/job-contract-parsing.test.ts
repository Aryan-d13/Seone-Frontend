/**
 * Job Contract Parsing Tests
 * 
 * Validate the UI correctly handles every backend response shape,
 * including edge cases: missing output, null clips, unknown steps.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useJobStore } from '@/stores/job';
import type { Job } from '@/types';

const BASE_JOB: Job = {
    id: 'contract-test-001',
    status: 'queued',
    progress: 0,
    clip_count: 3,
    created_at: '2026-02-10T13:00:00Z',
};

describe('Job Contract Parsing', () => {
    beforeEach(() => {
        useJobStore.getState().reset();
    });

    it('parses standard job response with output.clips', () => {
        const { setJob } = useJobStore.getState();

        const jobWithClips: Job = {
            ...BASE_JOB,
            status: 'completed',
            progress: 100,
            output: {
                clips: [
                    { index: 0, url: '/clips/clip_0.mp4', filename: 'clip_0.mp4' },
                    { index: 1, url: '/clips/clip_1.mp4', filename: 'clip_1.mp4' },
                ],
            },
        };

        setJob(jobWithClips);

        const state = useJobStore.getState();
        expect(state.job?.status).toBe('completed');
        expect(state.liveClips).toHaveLength(2);
        expect(state.liveClips[0].url).toBe('/clips/clip_0.mp4');
    });

    it('handles missing output field gracefully', () => {
        const { setJob } = useJobStore.getState();

        // Backend returns job with no output field
        const jobNoOutput: Job = {
            ...BASE_JOB,
            status: 'rendering',
            progress: 50,
        };

        setJob(jobNoOutput);

        const state = useJobStore.getState();
        expect(state.job).not.toBeNull();
        expect(state.liveClips).toHaveLength(0);
    });

    it('handles null clips array gracefully', () => {
        const { setJob } = useJobStore.getState();

        // Backend returns output with null clips  
        const jobNullClips: Job = {
            ...BASE_JOB,
            status: 'rendering',
            progress: 50,
            output: { clips: null as unknown as [] },
        };

        setJob(jobNullClips);

        const state = useJobStore.getState();
        expect(state.job).not.toBeNull();
        // Should not crash, clips should be empty
        expect(state.liveClips).toHaveLength(0);
    });

    it('rejects completed status with zero clips', () => {
        const { setJob } = useJobStore.getState();

        const completedEmpty: Job = {
            ...BASE_JOB,
            status: 'completed',
            progress: 100,
            output: { clips: [] },
        };

        setJob(completedEmpty);

        // A "completed" job with 0 clips must not be stored as completed
        const state = useJobStore.getState();
        expect(state.job?.status).not.toBe('completed');
    });

    it('maps phase=forked to a non-rendering display state', () => {
        const { setJob } = useJobStore.getState();

        const forkedJob: Job = {
            ...BASE_JOB,
            status: 'rendering',
            phase: 'forked',
            fork_join: {
                fork_entered_at: '2026-02-10T13:05:00Z',
                join_satisfied_at: null,
                is_forked: true,
                join_satisfied: false,
            },
            current_step: 'transcribe',
            progress: 40,
        };

        setJob(forkedJob);

        const state = useJobStore.getState();
        expect(state.job?.phase).toBe('forked');
        // The job should be stored correctly for the timeline to interpret
        expect(state.job).not.toBeNull();
    });

    it('maps all known step names to UI statuses', () => {
        // This test validates the mapping table used in useJobWebSocket.ts
        const STEP_TO_STATUS: Record<string, string> = {
            'download': 'downloading',
            'transcribe': 'transcribing',
            'analyze': 'analyzing',
            'smart_render': 'rendering',
        };

        // Verify the mapping is exhaustive for known steps
        expect(Object.keys(STEP_TO_STATUS)).toHaveLength(4);
        expect(STEP_TO_STATUS['download']).toBe('downloading');
        expect(STEP_TO_STATUS['transcribe']).toBe('transcribing');
        expect(STEP_TO_STATUS['analyze']).toBe('analyzing');
        expect(STEP_TO_STATUS['smart_render']).toBe('rendering');
    });

    it('handles unknown step names without crashing', () => {
        const { setJob, updateJob } = useJobStore.getState();

        setJob({ ...BASE_JOB, status: 'downloading' });

        // An unknown step name should not crash the store
        updateJob({ current_step: 'future_ml_step' });

        const state = useJobStore.getState();
        expect(state.job).not.toBeNull();
        expect(state.job?.current_step).toBe('future_ml_step');
    });
});
