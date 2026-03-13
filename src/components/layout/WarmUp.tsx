'use client';

/**
 * WarmUp — fire-and-forget health-check ping to wake up the API
 * from cold start (Azure Container Apps / Cloud Run scale-to-zero).
 *
 * Runs ONCE on first client-side mount. The fetch is intentionally
 * fire-and-forget — we don't care about the response, we just
 * need the container to start booting.
 */

import { useEffect, useRef } from 'react';
import { config } from '@/lib/config';

const HEALTH_PATH = '/api/v1/health';

export function WarmUp() {
    const hasFired = useRef(false);

    useEffect(() => {
        if (hasFired.current) return;
        hasFired.current = true;

        const url = `${config.api.baseUrl}${HEALTH_PATH}`;

        // Fire-and-forget — no await, no error handling needed.
        // We just need the TCP connection to wake the container.
        fetch(url, { mode: 'no-cors', cache: 'no-store' }).catch(() => {
            // Silently swallow — this is best-effort.
        });
    }, []);

    return null; // Renders nothing
}
