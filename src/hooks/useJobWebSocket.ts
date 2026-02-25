'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useJobStore } from '@/stores/job';
import { getWsUrl, endpoints } from '@/lib/config';
import { WebSocketEvent, Clip, JobSyncMessage, ResumeStateMessage } from '@/types';
import {
  authFetch,
  getValidAuthToken,
  isTokenExpired,
  getAuthToken,
} from '@/services/auth';

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
  const stabilityTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const needsAuthRef = useRef(false);
  // Track when connection opened — used to determine if onopen should reset attempts
  const connectedAtRef = useRef<number>(0);

  // ── Cursor resume state ──
  // cursor = Redis stream ID string (e.g. "1771999914424-0"), NOT numeric seq
  const lastCursorRef = useRef<string | null>(null);
  // seq = monotonic diagnostic counter, not used for reconnect
  const lastSeqRef = useRef<number | null>(null);
  // event_id deduplication set (bounded — cleared on reconnect)
  const seenEventIdsRef = useRef<Set<string>>(new Set());

  // ── Single-flight REST guard ──
  const fetchInFlightRef = useRef(false);

  // Zustand selectors (stable references)
  const setJob = useJobStore(state => state.setJob);
  const updateJob = useJobStore(state => state.updateJob);
  const addClip = useJobStore(state => state.addClip);
  const setError = useJobStore(state => state.setError);
  const setWsConnected = useJobStore(state => state.setWsConnected);
  const setLastEventAt = useJobStore(state => state.setLastEventAt);
  const setLastCursor = useJobStore(state => state.setLastCursor);

  // ── REST fetch with single-flight protection ──
  const fetchJob = useCallback(async () => {
    if (!mountedRef.current) return;
    if (fetchInFlightRef.current) {
      console.debug('[WS] fetchJob skipped — request already in flight');
      return;
    }
    fetchInFlightRef.current = true;
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
    } finally {
      fetchInFlightRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // ── Cursor watermark tracker ──
  const updateCursor = useCallback(
    (cursor: string | null | undefined) => {
      if (typeof cursor === 'string' && cursor.length > 0) {
        lastCursorRef.current = cursor;
        setLastCursor(cursor);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const connect = useCallback(() => {
    // ── Internal lifecycle guards ──
    if (!mountedRef.current) return;
    if (!jobId) return;
    const existingReadyState = wsRef.current?.readyState;
    if (
      existingReadyState === WebSocket.OPEN ||
      existingReadyState === WebSocket.CONNECTING
    ) {
      console.debug('[WS] Skipping connect â€” socket already active', {
        readyState: existingReadyState,
      });
      return;
    }

    // Terminal guard: don't connect if job is already done
    const currentJob = useJobStore.getState().job;
    if (
      currentJob &&
      currentJob.id === jobId &&
      (currentJob.status === 'completed' || currentJob.status === 'failed')
    ) {
      console.debug('[WS] Skipping connect — job is terminal:', currentJob.status);
      return;
    }

    // Auth guard: ensure token is valid before reconnect
    if (needsAuthRef.current) {
      const token = getAuthToken();
      if (!token || isTokenExpired(token)) {
        console.error('WebSocket auth required but token is expired/missing');
        setError('Session expired. Please refresh the page or log in again.');
        setWsConnected(false);
        return;
      }
      needsAuthRef.current = false;
    }

    const token = getValidAuthToken(60);
    if (!token) {
      console.error('No valid auth token available for WebSocket');
      setError('Session expired. Please refresh the page or log in again.');
      setWsConnected(false);
      return;
    }

    // ── Build URL with cursor resume ──
    let wsUrl = `${getWsUrl(endpoints.ws.job(jobId))}?token=${encodeURIComponent(token)}`;
    if (lastCursorRef.current) {
      wsUrl += `&cursor=${encodeURIComponent(lastCursorRef.current)}`;
      console.log('[WS] Reconnecting with cursor:', lastCursorRef.current);
    }

    // Clear dedup set on new connection (replayed events may repeat event_ids)
    seenEventIdsRef.current.clear();

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close(1000, 'Component unmounted during connect');
        return;
      }
      console.log('[WS] Connected', lastCursorRef.current ? '(resuming)' : '(fresh)');
      setWsConnected(true);
      // Delay counter reset — only if connection survives 5s minimum.
      // Prevents infinite loops where connect→die→reconnect resets counter.
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      stabilityTimerRef.current = setTimeout(() => {
        reconnectAttemptsRef.current = 0;
      }, 5000);
      needsAuthRef.current = false;
      // NOTE: No fetchJob() here — backend sends job_sync on connect.
      // REST initial load is handled by page.tsx useEffect, not the WS hook.
    };

    // ============================================
    // MESSAGE DISPATCH
    // Two-channel protocol:
    //   msg.type      → control channel (ping, job_sync, resume_state)
    //   msg.event_type → data channel  (connected, step_*, clip_*, job_*)
    //   kind = msg.type ?? msg.event_type
    // ============================================
    ws.onmessage = event => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        const kind: string | undefined = data.type ?? data.event_type;

        if (!kind) {
          console.warn('[WS] Message with no type or event_type:', data);
          return;
        }

        // ── Control channel ──
        switch (kind) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            return; // Skip setLastEventAt for heartbeats

          case 'job_sync': {
            const syncMsg = data as JobSyncMessage;
            console.log('[WS] job_sync received — snapping store to backend state');
            if (syncMsg.job) {
              setJob(syncMsg.job);
            }
            return;
          }

          case 'resume_state': {
            const resumeMsg = data as ResumeStateMessage;
            console.log(
              '[WS] resume_state received — cursor:',
              resumeMsg.cursor,
              'replayed:',
              resumeMsg.replayed
            );
            updateCursor(resumeMsg.cursor);
            return;
          }

          default:
            break; // Fall through to data channel
        }

        // ── Data channel ──
        const wsEvent = data as WebSocketEvent;
        setLastEventAt(new Date().toISOString());

        // Update cursor watermark from stream metadata
        updateCursor(wsEvent.cursor);

        // Monotonic seq tracking (diagnostic)
        if (typeof wsEvent.seq === 'number') {
          if (lastSeqRef.current !== null && wsEvent.seq <= lastSeqRef.current) {
            console.debug(
              '[WS] Non-monotonic seq:',
              wsEvent.seq,
              'last:',
              lastSeqRef.current
            );
          }
          if (lastSeqRef.current === null || wsEvent.seq > lastSeqRef.current) {
            lastSeqRef.current = wsEvent.seq;
          }
        }

        // event_id deduplication
        if (wsEvent.event_id) {
          if (seenEventIdsRef.current.has(wsEvent.event_id)) {
            console.debug('[WS] Duplicate event_id skipped:', wsEvent.event_id);
            return;
          }
          seenEventIdsRef.current.add(wsEvent.event_id);
        }

        switch (wsEvent.event_type) {
          case 'connected':
            console.log('[WS] Job connected:', wsEvent.message);
            break;

          case 'step_started': {
            const stepEvent = wsEvent as import('@/types').StepStartedEvent;
            const step =
              stepEvent.payload?.step ||
              (wsEvent as import('@/types').WebSocketEvent & { step?: string }).step;
            if (step) {
              // Terminal guard: don't process step events after job is terminal
              const storeJob = useJobStore.getState().job;
              if (
                storeJob &&
                (storeJob.status === 'completed' || storeJob.status === 'failed')
              ) {
                console.debug(
                  '[WS] Rejected step_started (terminal):',
                  step,
                  'current:',
                  storeJob.status,
                  {
                    event_id: wsEvent.event_id,
                    seq: wsEvent.seq,
                  }
                );
                break;
              }
              let status: import('@/types').JobStatus | undefined;

              switch (step) {
                case 'smart_render':
                  status = 'rendering';
                  break;
                case 'transcribe':
                  status = 'transcribing';
                  break;
                case 'analyze':
                  status = 'analyzing';
                  break;
                case 'download':
                  status = 'downloading';
                  break;
                default:
                  status = undefined;
              }

              if (status) {
                updateJob({
                  current_step: step,
                  status: status,
                });
              } else {
                updateJob({ current_step: step });
              }
            }
            break;
          }

          case 'step_completed':
            // Optional: could mark step as done visually
            break;

          case 'clip_ready': {
            const clipEvent = wsEvent as import('@/types').ClipReadyEvent;
            if (clipEvent.payload) {
              const clip: Clip = {
                index: clipEvent.payload.clip_index,
                url: clipEvent.payload.clip_url,
                filename:
                  clipEvent.payload.clip_url.split('/').pop() ||
                  `clip_${clipEvent.payload.clip_index}.mp4`,
              };
              addClip(clip);
              updateJob({
                progress:
                  (clipEvent.payload.clips_ready / clipEvent.payload.clip_count) * 100,
              });
            }
            break;
          }

          case 'job_completed': {
            const doneEvent = wsEvent as import('@/types').JobCompletedEvent;
            if (doneEvent.payload?.output) {
              const clips = doneEvent.payload.output?.clips;
              const hasValidClips = Array.isArray(clips) && clips.length > 0;

              if (!hasValidClips) {
                updateJob({
                  status: 'failed',
                  error_message: 'Job completed but produced no clips',
                });
                ws.close();
                break;
              }

              updateJob({
                status: 'completed',
                progress: 100,
                completed_at: new Date().toISOString(),
                output: doneEvent.payload.output,
              });
              // No fetchJob() here — terminal state set directly from WS
            }
            ws.close(1000, 'Job completed');
            break;
          }

          case 'job_failed': {
            const failEvent = wsEvent as import('@/types').JobFailedEvent;
            updateJob({
              status: 'failed',
              error_message: failEvent.payload?.error || 'Job failed',
            });
            ws.close();
            break;
          }

          default:
            // Unknown data event — never silent
            console.warn('[WS] Unknown event_type:', wsEvent.event_type, wsEvent);
            break;
        }
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    };

    ws.onclose = event => {
      console.warn(`[WS] Closed: code=${event.code} reason="${event.reason}"`);

      if (!mountedRef.current) return;

      // Stale-close guard: if a newer socket replaced us, do nothing.
      // Prevents dead connections from corrupting live ones after HMR.
      if (wsRef.current !== ws) {
        console.debug('[WS] Ignoring stale onclose from superseded socket');
        return;
      }

      setWsConnected(false);
      wsRef.current = null;

      // ── Stable connection check for attempt counter ──
      // Only reset attempts if the connection was alive for > 5 seconds.
      // Connections that open-then-die quickly should NOT reset the counter.
      const connectionLifetime = Date.now() - connectedAtRef.current;
      if (connectionLifetime > 5000) {
        reconnectAttemptsRef.current = 0;
      }

      // Check if this was an auth-related close
      const isAuthFailure = AUTH_CLOSE_CODES.has(event.code);

      if (isAuthFailure) {
        console.warn('[WS] Auth failure close (code:', event.code, ')');
        needsAuthRef.current = true;

        const authToken = getAuthToken();
        if (!authToken || isTokenExpired(authToken)) {
          setError('Session expired. Please refresh the page or log in again.');
          return;
        }
      }

      // Reconnect if not normal closure and not max attempts
      if (event.code !== 1000 && reconnectAttemptsRef.current < 5) {
        const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectAttemptsRef.current++;
        console.log(
          `[WS] Reconnecting in ${timeout}ms (attempt ${reconnectAttemptsRef.current}/5)`
        );
        reconnectTimeoutRef.current = setTimeout(connect, timeout);
      } else if (reconnectAttemptsRef.current >= 5) {
        console.error('[WS] Max reconnect attempts reached');
        setError('Connection lost. Please refresh the page.');
      }
    };

    ws.onerror = () => {
      console.warn('[WS] Connection failed (likely auth or network)');
      ws.close();
    };

    wsRef.current = ws;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (stabilityTimerRef.current) {
        clearTimeout(stabilityTimerRef.current);
        stabilityTimerRef.current = undefined;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, connect]);

  // ============================================
  // POLLING FALLBACK
  // Runs ONLY when WebSocket is disconnected.
  // WS is authoritative for live transitions; polling is recovery path.
  // ============================================
  const wsConnected = useJobStore(state => state.wsConnected);
  const job = useJobStore(state => state.job);

  useEffect(() => {
    if (!jobId || !mountedRef.current) return;

    // No polling when WebSocket is healthy
    if (wsConnected) return;

    // Stop polling if job is in a terminal state
    const isTerminal =
      job?.status === 'completed' ||
      job?.status === 'failed' ||
      job?.phase === 'completed' ||
      job?.phase === 'failed';
    if (isTerminal) return;

    console.log('[WS Fallback] Polling activated — WebSocket disconnected');

    const intervalId = setInterval(() => {
      if (mountedRef.current) {
        fetchJob();
      }
    }, 3000);

    return () => {
      clearInterval(intervalId);
      console.log('[WS Fallback] Polling deactivated');
    };
  }, [jobId, job?.status, job?.phase, fetchJob, wsConnected]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
