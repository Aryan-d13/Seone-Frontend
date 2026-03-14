'use client';

import { useEffect, useRef } from 'react';
import type { WarmupDebugPayload } from '@/lib/requestWarmup';

const LOG_PREFIX = '[WARMUP:debug]';

interface WarmupDebugLoggerProps {
  payload: WarmupDebugPayload | null;
}

export function WarmupDebugLogger({ payload }: WarmupDebugLoggerProps) {
  const lastLogSignature = useRef<string | null>(null);

  useEffect(() => {
    if (!payload) return;

    const signature = `${payload.at}:${payload.path}:${payload.targets.join('|')}`;
    if (lastLogSignature.current === signature) return;

    lastLogSignature.current = signature;
    console.log(`${LOG_PREFIX} middleware warmup triggered`, payload);
  }, [payload]);

  return null;
}
