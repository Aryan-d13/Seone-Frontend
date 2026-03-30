'use client';

import { motion } from 'framer-motion';
import { useJobStore } from '@/stores/job';
import { cn, humanizeJobError } from '@/lib/utils';
import styles from './PipelineTimeline.module.css';

const STEPS = [
  { id: 'queued', label: 'Queued' },
  { id: 'downloading', label: 'Downloading' },
  { id: 'transcribing', label: 'Listening' },
  { id: 'analyzing', label: 'Finding Moments' },
  { id: 'rendering', label: 'Building Clips' },
] as const;

function toTimelineStepId(value?: string): string {
  switch (value) {
    case 'queued':
    case 'downloading':
    case 'transcribing':
    case 'analyzing':
    case 'rendering':
      return value;
    case 'download':
      return 'downloading';
    case 'transcribe':
      return 'transcribing';
    case 'analyze':
      return 'analyzing';
    case 'smart_render':
      return 'rendering';
    default:
      return 'queued';
  }
}

export function PipelineTimeline() {
  const job = useJobStore(state => state.job);

  if (!job) return null;
  const displayState = job.ui_state;
  const displayStatus = displayState?.status ?? job.status;
  const failedStep =
    displayState?.active_step && displayState.active_step !== 'failed'
      ? displayState.active_step
      : job.current_step;
  const currentStepId =
    displayStatus === 'failed'
      ? toTimelineStepId(failedStep)
      : toTimelineStepId(displayStatus);

  const isCompleted = displayStatus === 'completed';
  const isFailed = displayStatus === 'failed';

  const currentStepIndex = Math.max(
    0,
    STEPS.findIndex(s => s.id === currentStepId)
  );
  const effectiveIndex = isCompleted ? STEPS.length : currentStepIndex;

  return (
    <div className={styles.container}>
      <div className={styles.summary}>
        <div className={styles.summaryLabel}>
          {displayState?.label ?? currentStepId.replace('_', ' ')}
        </div>
        {displayState?.sublabel && (
          <div className={styles.summarySublabel}>{displayState.sublabel}</div>
        )}
        {displayState?.parallel_hint && !isCompleted && !isFailed && (
          <div className={styles.parallelHint}>{displayState.parallel_hint}</div>
        )}
      </div>
      <div className={styles.timeline}>
        {STEPS.map((step, index) => {
          const isActive = !isCompleted && !isFailed && index === currentStepIndex;
          const isDone = index < effectiveIndex;
          const isError = isFailed && index === currentStepIndex;

          return (
            <div
              key={step.id}
              className={cn(styles.step, {
                [styles.active]: isActive,
                [styles.done]: isDone,
                [styles.error]: isError,
              })}
            >
              <div className={styles.iconWrapper}>
                <div className={styles.icon}>
                  {isDone ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : isError ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  ) : (
                    <div className={styles.dot} />
                  )}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(styles.line, {
                      [styles.lineDone]: index < effectiveIndex - 1,
                    })}
                  />
                )}
              </div>
              <span className={styles.label}>{step.label}</span>
            </div>
          );
        })}
      </div>

      {isFailed && job.error_message && (
        <motion.div
          className={styles.errorMessage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {humanizeJobError(job.error_message)}
        </motion.div>
      )}
    </div>
  );
}
