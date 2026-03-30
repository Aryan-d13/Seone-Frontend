'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import styles from './SlowLoadNotice.module.css';

const CONNECTING_DELAY_MS = 2000;
const WARMING_DELAY_MS = 8000;
const PLACEHOLDER_COPY = 'Loading status placeholder';
const FACT_ROTATION_MS = 10000;
const LOADING_NOTES = [
  'Bananas count as berries, but strawberries do not.',
  'A single clean pause can make the next line land twice as hard.',
  'Zero was formalized in ancient India long before it spread widely elsewhere.',
  'Octopuses can taste with their arms.',
];

type SlowLoadStage = 'idle' | 'connecting' | 'warming';

interface SlowLoadNoticeProps {
  className?: string;
  centered?: boolean;
}

export function SlowLoadNotice({ className, centered = false }: SlowLoadNoticeProps) {
  const [stage, setStage] = useState<SlowLoadStage>('idle');
  const [noteIndex, setNoteIndex] = useState(0);

  useEffect(() => {
    const connectingTimer = window.setTimeout(
      () => setStage('connecting'),
      CONNECTING_DELAY_MS
    );
    const warmingTimer = window.setTimeout(() => setStage('warming'), WARMING_DELAY_MS);
    const noteTimer = window.setInterval(() => {
      setNoteIndex(index => (index + 1) % LOADING_NOTES.length);
    }, FACT_ROTATION_MS);

    return () => {
      window.clearTimeout(connectingTimer);
      window.clearTimeout(warmingTimer);
      window.clearInterval(noteTimer);
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
      <span className={styles.pulse} aria-hidden="true" />
      <div className={styles.copy}>
        <span
          className={cn(styles.text, !message && styles.placeholder)}
          aria-hidden={!message}
        >
          {message || PLACEHOLDER_COPY}
        </span>
        <span className={styles.note}>
          <span className={styles.noteLabel}>Meanwhile</span>
          <span>{LOADING_NOTES[noteIndex]}</span>
        </span>
      </div>
    </div>
  );
}
