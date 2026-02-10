'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Job } from '@/types';
import { useJobs } from '@/hooks/useJobs';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { staggerContainer, listItemVariants } from '@/lib/animations';
import styles from './JobsList.module.css';

export function JobsList() {
    const router = useRouter();
    const { items, isLoading, hasMore, loadMore, error } = useJobs({ pageSize: 12 });

    if (error) {
        return (
            <div className={styles.error}>
                <p>{error}</p>
                <Button onClick={() => window.location.reload()} variant="secondary">
                    Retry
                </Button>
            </div>
        );
    }

    if (isLoading && items.length === 0) {
        return (
            <div className={styles.grid}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className={styles.skeleton} />
                ))}
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className={styles.empty}>
                <h3>No jobs found</h3>
                <p>Create your first job to get started</p>
                <Button onClick={() => router.push('/dashboard/new')}>
                    Create Job
                </Button>
            </div>
        );
    }

    // Group items by date
    const groupedItems = items.reduce((groups, job) => {
        const date = new Date(job.created_at);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        let key = 'Older';
        if (date.toDateString() === today.toDateString()) {
            key = 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            key = 'Yesterday';
        } else {
            key = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
        }

        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(job);
        return groups;
    }, {} as Record<string, Job[]>);

    return (
        <div className={styles.container}>
            {Object.entries(groupedItems).map(([dateLabel, jobs]) => (
                <div key={dateLabel} className={styles.section}>
                    <h3 className={styles.sectionTitle}>{dateLabel}</h3>
                    <motion.div
                        className={styles.grid}
                        variants={staggerContainer}
                        initial="initial"
                        animate="animate"
                    >
                        {jobs.map((job) => (
                            <motion.div
                                key={job.id}
                                className={styles.card}
                                variants={listItemVariants}
                                onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                                whileHover={{ y: -2, transition: { duration: 0.2 } }}
                            >
                                <div className={styles.cardHeader}>
                                    <h4 className={styles.jobId}>#{job.id.slice(0, 8)}</h4>
                                    <span className={cn(styles.status, styles[job.status])}>
                                        {job.status}
                                    </span>
                                </div>

                                <div className={styles.cardBody}>
                                    <div className={styles.metaRow}>
                                        <span className={styles.metaItem}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                            {job.status === 'completed' || job.status === 'failed'
                                                ? `${job.output?.clips?.length ?? 0} / ${job.clip_count} clips`
                                                : `${job.clip_count} clips`}
                                        </span>
                                        <span className={styles.metaItem}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>

                                {['downloading', 'transcribing', 'analyzing', 'rendering'].includes(job.status) && (
                                    <div className={styles.progressContainer}>
                                        <div
                                            className={styles.progressBar}
                                            style={{ width: `${job.progress}%` }}
                                        />
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            ))}

            {hasMore && (
                <div className={styles.loadMore}>
                    <Button
                        onClick={loadMore}
                        variant="secondary"
                        isLoading={isLoading}
                    >
                        Load More
                    </Button>
                </div>
            )}
        </div>
    );
}
