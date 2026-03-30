'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { endpoints } from '@/lib/config';
import { authFetch } from '@/services/auth';
import type { Job, UXFact } from '@/types';
import { cn } from '@/lib/utils';
import styles from './JobLivePanel.module.css';

const ACTIVE_STATUSES = new Set([
  'queued',
  'downloading',
  'transcribing',
  'analyzing',
  'rendering',
] as const);

const FALLBACK_WHISPERS: UXFact[] = [
  {
    id: 'local-curiosity-001',
    headline: 'Bananas are berries',
    body: "Botanically, bananas count as berries while strawberries don't.",
    tag: 'Curiosity',
    audience_scope: 'global',
    ttl_seconds: 10,
  },
  {
    id: 'local-puzzle-001',
    headline: 'A tiny riddle',
    body: 'What comes once in a minute, twice in a moment, and never in a thousand years?',
    tag: 'Puzzle',
    audience_scope: 'wildcard',
    ttl_seconds: 12,
  },
  {
    id: 'local-craft-001',
    headline: 'Punctuation shapes rhythm',
    body: 'A single comma can make the exact same line feel calmer, sharper, or more dramatic.',
    tag: 'Craft',
    audience_scope: 'global',
    ttl_seconds: 10,
  },
  {
    id: 'local-india-001',
    headline: 'Zero has a history',
    body: 'The number zero was formalized in ancient India centuries before it spread widely elsewhere.',
    tag: 'India-Light',
    audience_scope: 'india_light',
    ttl_seconds: 10,
  },
  {
    id: 'local-oddity-001',
    headline: 'Octopuses taste by touch',
    body: 'Their suckers can detect chemicals, so touch and taste blur together for them.',
    tag: 'Oddity',
    audience_scope: 'wildcard',
    ttl_seconds: 10,
  },
];

interface JobLivePanelProps {
  job: Job;
  jobId?: string;
  className?: string;
}

function stageLabel(status: Job['status']): string {
  switch (status) {
    case 'transcribing':
      return 'Listening';
    case 'analyzing':
      return 'Finding moments';
    case 'rendering':
      return 'Building clips';
    case 'downloading':
      return 'Downloading';
    case 'queued':
      return 'Queued';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Needs attention';
  }
}

function whisperText(fact: UXFact | undefined): string {
  if (!fact) return '';
  return fact.body?.trim() || fact.headline?.trim() || '';
}

export function JobLivePanel({ job, jobId, className }: JobLivePanelProps) {
  const reduceMotion = useReducedMotion();
  const uiState = job.ui_state;
  const displayStatus = uiState?.status ?? job.status;
  const progress = uiState?.progress ?? job.progress ?? 0;
  const isActive = ACTIVE_STATUSES.has(displayStatus);
  const [facts, setFacts] = useState<UXFact[]>(FALLBACK_WHISPERS);
  const [factIndex, setFactIndex] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const refreshMarkerRef = useRef<string | null>(null);

  useEffect(() => {
    setFactIndex(0);
    refreshMarkerRef.current = null;

    if (!jobId || !isActive) {
      setIsFetching(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function fetchFacts() {
      setIsFetching(true);
      try {
        const response = await authFetch(
          endpoints.ux.facts({
            slot: 'job_wait',
            count: 5,
            jobId,
          }),
          { signal: controller.signal }
        );
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { facts?: UXFact[] };
        if (!cancelled && Array.isArray(payload.facts) && payload.facts.length > 0) {
          setFacts(payload.facts);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('[JobLivePanel] Failed to fetch UX facts', error);
        }
      } finally {
        if (!controller.signal.aborted && !cancelled) {
          setIsFetching(false);
        }
      }
    }

    fetchFacts();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isActive, jobId]);

  useEffect(() => {
    if (!isActive || facts.length <= 1) {
      return;
    }

    const currentTtl = facts[factIndex]?.ttl_seconds ?? 10;
    const rotationMs = Math.min(12000, Math.max(8000, currentTtl * 1000));
    const timer = window.setTimeout(() => {
      setFactIndex(index => (index + 1) % facts.length);
    }, rotationMs);

    return () => window.clearTimeout(timer);
  }, [factIndex, facts, isActive]);

  useEffect(() => {
    if (!isActive || !jobId || facts.length === 0) {
      return;
    }
    if (factIndex < Math.max(facts.length - 2, 1)) {
      return;
    }

    const refreshMarker = `${jobId}:${facts[factIndex]?.id ?? factIndex}:${facts.length}`;
    if (refreshMarkerRef.current === refreshMarker) {
      return;
    }
    refreshMarkerRef.current = refreshMarker;

    const controller = new AbortController();
    let cancelled = false;

    async function refreshFacts() {
      setIsFetching(true);
      try {
        const response = await authFetch(
          endpoints.ux.facts({
            slot: 'job_wait',
            count: 5,
            jobId,
          }),
          { signal: controller.signal }
        );
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { facts?: UXFact[] };
        if (!cancelled && Array.isArray(payload.facts) && payload.facts.length > 0) {
          setFacts(payload.facts);
          setFactIndex(0);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('[JobLivePanel] Failed to refresh UX facts', error);
        }
      } finally {
        if (!controller.signal.aborted && !cancelled) {
          setIsFetching(false);
        }
      }
    }

    refreshFacts();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [factIndex, facts, isActive, jobId]);

  const whisper = whisperText(facts[factIndex] ?? FALLBACK_WHISPERS[0]);

  return (
    <section
      className={cn(styles.panel, className)}
      data-status={displayStatus}
      data-testid="job-live-panel"
      aria-busy={isFetching}
    >
      <div className={styles.header}>
        <div className={styles.statusRow}>
          <span className={styles.pulse} aria-hidden="true" />
          <div className={styles.copy}>
            <p className={styles.title}>{uiState?.label ?? 'Processing your job'}</p>
            {uiState?.sublabel && <p className={styles.subtitle}>{uiState.sublabel}</p>}
            {uiState?.parallel_hint && isActive && (
              <p className={styles.parallelHint}>{uiState.parallel_hint}</p>
            )}
          </div>
        </div>

        <div className={styles.progressMeta}>
          <span>{progress}% complete</span>
          <span className={styles.progressStage}>{stageLabel(displayStatus)}</span>
        </div>
      </div>

      <div className={styles.progressRail} aria-hidden="true">
        <motion.div
          className={styles.progressFill}
          initial={false}
          animate={{
            width: `${progress}%`,
            opacity: isActive || displayStatus === 'completed' ? 1 : 0.75,
          }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 110, damping: 20 }}
        />
      </div>

      {isActive && whisper && (
        <motion.div
          key={`${facts[factIndex]?.id ?? 'fallback'}-${factIndex}`}
          className={styles.whisper}
          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
          data-testid="job-live-whisper"
        >
          <span className={styles.whisperLabel}>Meanwhile</span>
          <span className={styles.whisperText}>{whisper}</span>
        </motion.div>
      )}
    </section>
  );
}
