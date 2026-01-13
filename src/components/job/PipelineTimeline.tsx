'use client';

import { motion } from 'framer-motion';
import { useJobStore } from '@/stores/job';
import { cn } from '@/lib/utils';
import styles from './PipelineTimeline.module.css';

const STEPS = [
    { id: 'queued', label: 'Queued' },
    { id: 'downloading', label: 'Downloading' },
    { id: 'transcribing', label: 'Transcribing' },
    { id: 'analyzing', label: 'Analyzing' },
    { id: 'rendering', label: 'Rendering' },
] as const;

export function PipelineTimeline() {
    const job = useJobStore(state => state.job);

    if (!job) return null;

    // Mapping layer: Backend Step -> UI Status
    const STEP_MAPPING: Record<string, string> = {
        'download': 'downloading',
        'transcribe': 'transcribing',
        'analyze': 'analyzing',
        'smart_render': 'rendering'
    };

    // Determine current step index
    // If job is completed, all steps are done
    // If failed, stop at current step
    const rawStep = job.current_step || 'queued';
    const currentStepId = STEP_MAPPING[rawStep] || rawStep;

    const isCompleted = job.status === 'completed';
    const isFailed = job.status === 'failed';

    const currentStepIndex = STEPS.findIndex(s => s.id === currentStepId);
    // If completed, index is effectively past the last step
    const effectiveIndex = isCompleted ? STEPS.length : currentStepIndex;

    return (
        <div className={styles.container}>
            <div className={styles.timeline}>
                {STEPS.map((step, index) => {
                    const isActive = !isCompleted && !isFailed && index === currentStepIndex;
                    const isDone = index < effectiveIndex;
                    const isError = isFailed && index === currentStepIndex;

                    return (
                        <div key={step.id} className={cn(styles.step, {
                            [styles.active]: isActive,
                            [styles.done]: isDone,
                            [styles.error]: isError
                        })}>
                            <div className={styles.icon}>
                                {isDone ? (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : isError ? (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                ) : (
                                    <div className={styles.dot} />
                                )}
                            </div>
                            <span className={styles.label}>{step.label}</span>

                            {index < STEPS.length - 1 && (
                                <div className={cn(styles.line, {
                                    [styles.lineDone]: index < effectiveIndex - 1
                                })} />
                            )}
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
                    {job.error_message}
                </motion.div>
            )}
        </div>
    );
}
