import { create } from 'zustand';
import { Job, Clip } from '@/types';

const getClipKey = (clip: Clip): string => {
    const index = Number(clip.index);
    if (Number.isFinite(index)) return `index:${index}`;
    if (clip.url) return `url:${clip.url}`;
    if (clip.filename) return `file:${clip.filename}`;
    return `unknown:${JSON.stringify(clip)}`;
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
        const isSameJob = state.job?.id === job.id;
        const mergedClips = mergeClips(isSameJob ? state.liveClips : [], job.output?.clips ?? []);

        return {
            job,
            liveClips: mergedClips,
            error: null
        };
    }),

    updateJob: (updates) => set((state) => ({
        job: state.job ? { ...state.job, ...updates } : null
    })),

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
