import { create } from 'zustand';
import { Job, Clip } from '@/types';

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

    setJob: (job) => set({
        job,
        // Always clear liveClips on full fetch to avoid duplicates and ensure truth
        liveClips: [],
        error: null
    }),

    updateJob: (updates) => set((state) => ({
        job: state.job ? { ...state.job, ...updates } : null
    })),

    addClip: (clip) => set((state) => {
        // Avoid duplicates based on index
        if (state.liveClips.some(c => c.index === clip.index)) return {};

        return {
            liveClips: [...state.liveClips, clip].sort((a, b) => a.index - b.index)
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
