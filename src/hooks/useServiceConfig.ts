// ============================================
// SERVICE CONFIG STORE
// Polls backend config to determine if app is in read-only mode
// ============================================

import { create } from 'zustand';
import { getApiUrl, endpoints } from '@/lib/config';

interface ServiceConfigState {
    killSwitch: boolean;
    message: string | null;
    isLoading: boolean;
    lastChecked: Date | null;

    // Actions
    poll: () => Promise<void>;
    startPolling: (intervalMs?: number) => () => void;
}

export const useServiceConfig = create<ServiceConfigState>((set, get) => ({
    // Default to fail-open (healthy)
    killSwitch: false,
    message: null,
    isLoading: true,
    lastChecked: null,

    poll: async () => {
        try {
            const response = await fetch(getApiUrl(endpoints.config.status), {
                // No auth headers needed for this public endpoint
                method: 'GET',
                // Don't cache the config poll
                cache: 'no-store',
            });

            if (!response.ok) {
                // Fail-open: if endpoint is down, assume app is healthy
                set({ isLoading: false, killSwitch: false, lastChecked: new Date() });
                return;
            }

            const data = await response.json();

            set({
                killSwitch: Boolean(data.kill_switch),
                message: data.message || null,
                isLoading: false,
                lastChecked: new Date(),
            });
        } catch (error) {
            // Fail-open on network errors too
            set({ isLoading: false, killSwitch: false, lastChecked: new Date() });
        }
    },

    startPolling: (intervalMs = 30000) => {
        // Initial poll
        get().poll();

        // Setup interval
        const intervalId = setInterval(() => {
            get().poll();
        }, intervalMs);

        // Return cleanup function
        return () => clearInterval(intervalId);
    },
}));
