
import { create } from 'zustand';
import { Job, Clip, JobStatus, JobPhase } from '@/types';

// ============================================
// TERMINAL STATE GUARDS
// Once a job reaches completed or failed, no event may regress it.
// Failed overrides completed (terminal monotonicity).
// ============================================

const TERMINAL_STATUSES = new Set<string>(['completed', 'failed']);

const isTerminalStatus = (status: JobStatus | undefined): boolean =>
    status !== undefined && TERMINAL_STATUSES.has(status);

const isTerminalPhase = (phase: JobPhase | undefined): boolean =>
    phase !== undefined && TERMINAL_STATUSES.has(phase);

const isTerminal = (job: Job | null): boolean =>
    job !== null && (isTerminalStatus(job.status) || isTerminalPhase(job.phase));

/**
 * Validates that a "completed" job actually has clips.
 * A completed job with 0 clips is an effective failure.
 */
const hasValidClips = (job: Job): boolean => {
    const clips = job.output?.clips;
    return Array.isArray(clips) && clips.length > 0;
};

// ============================================
// CLIP UTILITIES
// ============================================

const getClipKey = (clip: Clip): string => {
    const index = Number(clip.index);
    if (Number.isFinite(index)) return `index:${index} `;
    if (clip.url) return `url:${clip.url} `;
    if (clip.filename) return `file:${clip.filename} `;
    return `unknown:${JSON.stringify(clip)} `;
};

const sortClips = (clips: Clip[]): Clip[] => {
    return [...clips].sort((a, b) => {
        const aIndex = Number(a.index);
        const bIndex = Number(b.index);
        const aValid = Number.isFinite(aIndex);
        const bValid = Number.isFinite(bIndex);

        if (aValid && bValid) return aIndex - bIndex;
        if (aValid) return -1;
        if (bValid) return 1;
        return 0;
    });
};

const mergeClips = (base: Clip[], incoming: Clip[]): Clip[] => {
    if (base.length === 0) return sortClips(incoming);
    if (incoming.length === 0) return sortClips(base);

    const byKey = new Map<string, Clip>();
    for (const clip of base) {
        byKey.set(getClipKey(clip), clip);
    }
    for (const clip of incoming) {
        byKey.set(getClipKey(clip), clip);
    }

    return sortClips(Array.from(byKey.values()));
};

// ============================================
// STORE
// ============================================

interface JobState {
    job: Job | null;
    liveClips: Clip[];
    wsConnected: boolean;
    lastEventAt: string | null;
    isLoading: boolean;
    error: string | null;

    // Actions
    setJob: (job: Job) => void;
    updateJob: (updates: Partial<Job>) => void;
    addClip: (clip: Clip) => void;
    setWsConnected: (connected: boolean) => void;
    setLastEventAt: (timestamp: string) => void;
    setError: (error: string | null) => void;
    setLoading: (isLoading: boolean) => void;
    reset: () => void;
}

export const useJobStore = create<JobState>((set) => ({
    job: null,
    liveClips: [],
    wsConnected: false,
    lastEventAt: null,
    isLoading: false,
    error: null,

    setJob: (job) => set((state) => {
        // ── Terminal monotonicity guard ──
        if (isTerminal(state.job)) {
            // Exception: failed always overrides completed
            if (state.job!.status === 'completed' && job.status === 'failed') {
                return { job, liveClips: [], error: null };
            }
            // Reject all other updates to terminal jobs
            return {};
        }

        // ── Clip validation: completed with empty clips → failed ──
        if (job.status === 'completed' && !hasValidClips(job)) {
            const failedJob: Job = {
                ...job,
                status: 'failed' as JobStatus,
                error_message: job.error_message || 'Job completed but produced no clips',
            };
            return {
                job: failedJob,
                liveClips: [],
                error: null,
            };
        }

        const isSameJob = state.job?.id === job.id;
        const mergedClips = mergeClips(isSameJob ? state.liveClips : [], job.output?.clips ?? []);

        return {
            job,
            liveClips: mergedClips,
            // Preserve error if current state is failed (defensive, should not reach here due to guard)
            error: state.job?.status === 'failed' ? state.error : null,
        };
    }),

    updateJob: (updates) => set((state) => {
        if (!state.job) return {};

        // ── Terminal monotonicity guard ──
        if (isTerminal(state.job) && updates.status !== 'failed') {
            return {};
        }

        // ── Clip validation: completed with empty clips → failed ──
        if (updates.status === 'completed') {
            const clips = updates.output?.clips;
            if (!Array.isArray(clips) || clips.length === 0) {
                return {
                    job: {
                        ...state.job,
                        ...updates,
                        status: 'failed' as JobStatus,
                        error_message: updates.error_message || 'Job completed but produced no clips',
                    },
                };
            }
        }

        return {
            job: { ...state.job, ...updates },
        };
    }),

    addClip: (clip) => set((state) => {
        const clipKey = getClipKey(clip);
        if (state.liveClips.some(existing => getClipKey(existing) === clipKey)) return {};

        return {
            liveClips: sortClips([...state.liveClips, clip])
        };
    }),

    setWsConnected: (connected) => set({ wsConnected: connected }),
    setLastEventAt: (timestamp) => set({ lastEventAt: timestamp }),

    setError: (error) => set({ error }),
    setLoading: (isLoading) => set({ isLoading }),
    reset: () => set({
        job: null,
        liveClips: [],
        wsConnected: false,
        lastEventAt: null,
        isLoading: false,
        error: null
    }),
}));
