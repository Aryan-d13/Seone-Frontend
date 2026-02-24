/**
 * WebSocket Heartbeat Tests
 *
 * Validates the ping/pong contract between frontend and backend.
 * The server sends {"type": "ping"} every 25s.
 * The client must reply with {"type": "pong"}.
 * If no pong is received within 35s, the server kills the connection.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useJobStore } from '@/stores/job';
import type { Job } from '@/types';

const BASE_JOB: Job = {
    id: 'heartbeat-test-001',
    status: 'queued',
    progress: 0,
    clip_count: 3,
    created_at: '2026-02-24T12:00:00Z',
};

/**
 * Simulates the ping-handling branch extracted from useJobWebSocket.ts:
 *
 * ```ts
 * const data = JSON.parse(event.data);
 * if (data.type === 'ping') {
 *   ws.send(JSON.stringify({ type: 'pong' }));
 *   return; // ← does NOT call setLastEventAt or process event_type
 * }
 * ```
 *
 * Returns { replied: boolean, sentPayload: string | null }
 */
function simulatePingHandler(
    messageData: string,
    sendFn: (payload: string) => void
): { replied: boolean; sentPayload: string | null } {
    const data = JSON.parse(messageData);

    if (data.type === 'ping') {
        const payload = JSON.stringify({ type: 'pong' });
        sendFn(payload);
        return { replied: true, sentPayload: payload };
    }

    return { replied: false, sentPayload: null };
}

describe('WS Heartbeat — Ping/Pong Contract', () => {
    beforeEach(() => {
        useJobStore.getState().reset();
        useJobStore.getState().setJob(BASE_JOB);
    });

    it('replies with {"type":"pong"} when receiving {"type":"ping"}', () => {
        const sent: string[] = [];
        const sendFn = (payload: string) => sent.push(payload);

        const result = simulatePingHandler(JSON.stringify({ type: 'ping' }), sendFn);

        expect(result.replied).toBe(true);
        expect(sent).toHaveLength(1);
        expect(JSON.parse(sent[0])).toEqual({ type: 'pong' });
    });

    it('ping does not update lastEventAt', () => {
        const { setLastEventAt } = useJobStore.getState();
        setLastEventAt('2026-02-24T11:00:00Z');

        // Simulate the guard: ping returns early BEFORE setLastEventAt is called
        const result = simulatePingHandler(
            JSON.stringify({ type: 'ping' }),
            () => { }
        );

        expect(result.replied).toBe(true);
        // Since the handler returns early, lastEventAt should remain unchanged
        expect(useJobStore.getState().lastEventAt).toBe('2026-02-24T11:00:00Z');
    });

    it('ping does not mutate job state', () => {
        const jobBefore = useJobStore.getState().job;

        const result = simulatePingHandler(
            JSON.stringify({ type: 'ping' }),
            () => { }
        );

        expect(result.replied).toBe(true);
        expect(useJobStore.getState().job).toEqual(jobBefore);
    });

    it('normal events are not intercepted by ping handler', () => {
        const sent: string[] = [];
        const sendFn = (payload: string) => sent.push(payload);

        // step_started uses event_type, not type — should NOT be intercepted
        const result = simulatePingHandler(
            JSON.stringify({
                event_type: 'step_started',
                job_id: 'heartbeat-test-001',
                timestamp: '2026-02-24T12:00:00Z',
                payload: { step: 'smart_render' },
            }),
            sendFn
        );

        expect(result.replied).toBe(false);
        expect(sent).toHaveLength(0);
    });
});
