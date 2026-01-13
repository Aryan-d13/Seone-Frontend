'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useJobStore } from '@/stores/job';
import { getWsUrl, endpoints } from '@/lib/config';
import { WebSocketEvent, Clip } from '@/types';
import { authFetch } from '@/services/auth';

export function useJobWebSocket(jobId: string) {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const reconnectAttemptsRef = useRef(0);

    // Use selectors to avoid unnecessary re-renders and satisfy linter
    const setJob = useJobStore(state => state.setJob);
    const updateJob = useJobStore(state => state.updateJob);
    const addClip = useJobStore(state => state.addClip);
    const setError = useJobStore(state => state.setError);
    const setWsConnected = useJobStore(state => state.setWsConnected);
    const setLastEventAt = useJobStore(state => state.setLastEventAt);

    const fetchJob = useCallback(async () => {
        try {
            const response = await authFetch(endpoints.jobs.get(jobId));
            if (!response.ok) throw new Error('Failed to fetch job');
            const data = await response.json();
            setJob(data);
        } catch (err) {
            console.error('Failed to fetch job:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch job');
        }
    }, [jobId, setJob, setError]);

    const connect = useCallback(() => {
        if (!jobId) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const wsUrl = getWsUrl(endpoints.ws.job(jobId));
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connected');
            setWsConnected(true);
            reconnectAttemptsRef.current = 0;
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as WebSocketEvent;
                setLastEventAt(new Date().toISOString());

                switch (data.event_type) {
                    case 'connected':
                        console.log('Job connected:', data.message);
                        break;

                    case 'step_started':
                        if (data.payload?.step) {
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
            setWsConnected(false);
            wsRef.current = null;

            // Reconnect if not normal closure and not max attempts
            if (event.code !== 1000 && reconnectAttemptsRef.current < 5) {
                const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
                reconnectAttemptsRef.current++;
                reconnectTimeoutRef.current = setTimeout(connect, timeout);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            ws.close();
        };

        wsRef.current = ws;
    }, [jobId, updateJob, addClip, fetchJob, setWsConnected, setLastEventAt]);

    useEffect(() => {
        connect();

        return () => {
            if (wsRef.current) {
                wsRef.current.close(1000, 'Component unmounting');
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [connect]);

    return {
        isConnected: wsRef.current?.readyState === WebSocket.OPEN
    };
}
