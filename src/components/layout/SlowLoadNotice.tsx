'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import styles from './SlowLoadNotice.module.css';

const CONNECTING_DELAY_MS = 2000;
const WARMING_DELAY_MS = 8000;
const PLACEHOLDER_COPY = 'Loading status placeholder';

type SlowLoadStage = 'idle' | 'connecting' | 'warming';

interface SlowLoadNoticeProps {
  className?: string;
  centered?: boolean;
}

export function SlowLoadNotice({ className, centered = false }: SlowLoadNoticeProps) {
  const [stage, setStage] = useState<SlowLoadStage>('idle');

  useEffect(() => {
    const connectingTimer = window.setTimeout(
      () => setStage('connecting'),
      CONNECTING_DELAY_MS
    );
    const warmingTimer = window.setTimeout(() => setStage('warming'), WARMING_DELAY_MS);

    return () => {
      window.clearTimeout(connectingTimer);
      window.clearTimeout(warmingTimer);
    };
  }, []);

  const message =
    stage === 'connecting'
      ? 'Connecting to Seone...'
      : stage === 'warming'
        ? 'Waking up backend, this can take a bit on cold start.'
        : '';

  return (
    <div
      className={cn(styles.notice, centered && styles.centered, className)}
      data-testid="slow-load-notice"
      aria-live="polite"
    >
      <span
        className={cn(styles.text, !message && styles.placeholder)}
        aria-hidden={!message}
      >
        {message || PLACEHOLDER_COPY}
      </span>
    </div>
  );
}
