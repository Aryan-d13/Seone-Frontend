'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useJobStore } from '@/stores/job';
import { getWsUrl, endpoints } from '@/lib/config';
import { WebSocketEvent, Clip } from '@/types';
import { authFetch, getValidAuthToken, isTokenExpired, getAuthToken } from '@/services/auth';

// ============================================
// AUTH-RELATED CLOSE CODES
// Backend should use these to signal auth failures
// ============================================
const AUTH_CLOSE_CODES = new Set([
    4001, // Custom: Unauthorized
    4003, // Custom: Forbidden
    1008, // Policy Violation (standard)
]);

export function useJobWebSocket(jobId: string) {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const reconnectAttemptsRef = useRef(0);
    const mountedRef = useRef(true); // Prevent state updates after unmount
    const needsAuthRef = useRef(false); // Track if reconnect requires fresh auth

    // Use selectors to avoid unnecessary re-renders and satisfy linter
    const setJob = useJobStore(state => state.setJob);
    const updateJob = useJobStore(state => state.updateJob);
    const addClip = useJobStore(state => state.addClip);
    const setError = useJobStore(state => state.setError);
    const setWsConnected = useJobStore(state => state.setWsConnected);
    const setLastEventAt = useJobStore(state => state.setLastEventAt);
    const job = useJobStore(state => state.job);

    const fetchJob = useCallback(async () => {
        if (!mountedRef.current) return;
        try {
            const response = await authFetch(endpoints.jobs.get(jobId));
            if (!response.ok) throw new Error('Failed to fetch job');
            const data = await response.json();
            if (mountedRef.current) setJob(data);
        } catch (err) {
            console.error('Failed to fetch job:', err);
            if (mountedRef.current) {
                setError(err instanceof Error ? err.message : 'Failed to fetch job');
            }
        }
    }, [jobId, setJob, setError]);

    const connect = useCallback(() => {
        // Guard: component still mounted?
        if (!mountedRef.current) return;
        if (!jobId) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        // Check if we need fresh auth before attempting reconnect
        if (needsAuthRef.current) {
            const token = getAuthToken();
            if (!token || isTokenExpired(token)) {
                console.error('WebSocket auth required but token is expired/missing');
                // Surface user-visible error with recovery path
                setError('Session expired. Please refresh the page or log in again.');
                setWsConnected(false);
                return;
            }
            // Token is fresh, clear the auth-needed flag
            needsAuthRef.current = false;
        }

        // Use getValidAuthToken which checks expiry with buffer
        const token = getValidAuthToken(60); // 60 second buffer
        if (!token) {
            console.error('No valid auth token available for WebSocket');
            // Surface user-visible error
            setError('Session expired. Please refresh the page or log in again.');
            setWsConnected(false);
            return;
        }

        const wsUrl = `${getWsUrl(endpoints.ws.job(jobId))}?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            if (!mountedRef.current) {
                ws.close(1000, 'Component unmounted during connect');
                return;
            }
            console.log('WebSocket connected - Syncing state...');
            setWsConnected(true);
            reconnectAttemptsRef.current = 0;
            needsAuthRef.current = false;

            // SYNC-ON-CONNECT:
            // Immediately fetch the canonical state from REST to ensure we are up to date.
            // This handles late joins and recovers from lost events during disconnects.
            fetchJob();
        };

        ws.onmessage = (event) => {
            if (!mountedRef.current) return;
            try {
                const data = JSON.parse(event.data) as WebSocketEvent;
                setLastEventAt(new Date().toISOString());

                switch (data.event_type) {
                    case 'connected':
                        console.log('Job connected:', data.message);
                        break;

                    case 'step_started':
                        if (data.payload?.step) {
                            // Terminal guard: don't process step events after job is terminal
                            const currentJob = useJobStore.getState().job;
                            if (currentJob && (currentJob.status === 'completed' || currentJob.status === 'failed')) {
                                break;
                            }
                            const step = data.payload.step;
                            let status: import('@/types').JobStatus | undefined;

                            switch (step) {
                                case 'smart_render': status = 'rendering'; break;
                                case 'transcribe': status = 'transcribing'; break;
                                case 'analyze': status = 'analyzing'; break;
                                case 'download': status = 'downloading'; break;
                                default: status = undefined;
                            }

                            if (status) {
                                updateJob({
                                    current_step: step,
                                    status: status
                                });
                            } else {
                                updateJob({ current_step: step });
                            }
                        }
                        break;

                    case 'step_completed':
                        // Optional: could mark step as done visually
                        break;

                    case 'clip_ready':
                        if (data.payload) {
                            const clip: Clip = {
                                index: data.payload.clip_index,
                                url: data.payload.clip_url,
                                filename: data.payload.clip_url.split('/').pop() || `clip_${data.payload.clip_index}.mp4`,
                            };
                            addClip(clip);
                            updateJob({
                                progress: (data.payload.clips_ready / data.payload.clip_count) * 100
                            });
                        }
                        break;

                    case 'job_completed':
                        if (data.payload?.output) {
                            const clips = data.payload.output?.clips;
                            const hasValidClips = Array.isArray(clips) && clips.length > 0;

                            if (!hasValidClips) {
                                // Completed with no clips = effective failure
                                updateJob({
                                    status: 'failed',
                                    error_message: 'Job completed but produced no clips'
                                });
                                ws.close();
                                break;
                            }

                            updateJob({
                                status: 'completed',
                                progress: 100,
                                completed_at: new Date().toISOString(),
                                output: data.payload.output
                            });
                            // Reconcile with REST API
                            fetchJob();
                        }
                        break;

                    case 'job_failed':
                        updateJob({
                            status: 'failed',
                            error_message: data.payload?.error || 'Job failed'
                        });
                        ws.close();
                        break;
                }
            } catch (err) {
                console.error('Failed to parse WebSocket message:', err);
            }
        };

        ws.onclose = (event) => {
            console.log('WebSocket closed:', event.code, event.reason);

            if (!mountedRef.current) return;

            setWsConnected(false);
            wsRef.current = null;

            // Check if this was an auth-related close
            const isAuthFailure = AUTH_CLOSE_CODES.has(event.code);

            if (isAuthFailure) {
                console.warn('WebSocket closed due to auth failure (code:', event.code, ')');
                needsAuthRef.current = true;

                // Check if we can recover with current token
                const token = getAuthToken();
                if (!token || isTokenExpired(token)) {
                    // Token is definitely bad, surface error to user
                    setError('Session expired. Please refresh the page or log in again.');
                    // Don't attempt reconnect
                    return;
                }
                // Token looks valid, try reconnect (will re-check in connect())
            }

            // Reconnect if not normal closure and not max attempts
            if (event.code !== 1000 && reconnectAttemptsRef.current < 5) {
                const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
                reconnectAttemptsRef.current++;
                console.log(`Reconnecting in ${timeout}ms (attempt ${reconnectAttemptsRef.current}/5)`);
                reconnectTimeoutRef.current = setTimeout(connect, timeout);
            } else if (reconnectAttemptsRef.current >= 5) {
                console.error('Max reconnect attempts reached');
                setError('Connection lost. Please refresh the page.');
            }
        };

        ws.onerror = () => {
            // Note: Browser WS errors intentionally contain no details per spec
            // This is expected during auth teardown, not exceptional
            console.warn('WebSocket connection failed (likely auth or network)');
            ws.close();
        };

        wsRef.current = ws;
    }, [jobId, updateJob, addClip, fetchJob, setWsConnected, setLastEventAt, setError]);

    useEffect(() => {
        mountedRef.current = true;
        connect();

        return () => {
            mountedRef.current = false;
            if (wsRef.current) {
                wsRef.current.close(1000, 'Component unmounting');
                wsRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = undefined;
            }
        };
    }, [connect]);

    // POLLING STRATEGY:
    // Reconcile with REST every 3 seconds while job is non-terminal.
    // This ensures we converge to the correct state even if WS events are missed.
    useEffect(() => {
        if (!jobId || !mountedRef.current) return;

        // Stop polling if job is in a terminal state
        const isTerminal = job?.status === 'completed' || job?.status === 'failed' || job?.phase === 'completed' || job?.phase === 'failed';
        if (isTerminal) return;

        const intervalId = setInterval(() => {
            if (mountedRef.current) {
                // console.log('Polling job state...'); // Debug
                fetchJob();
            }
        }, 3000);

        return () => clearInterval(intervalId);
    }, [jobId, job?.status, job?.phase, fetchJob]);

    return {
        isConnected: wsRef.current?.readyState === WebSocket.OPEN
    };
}
