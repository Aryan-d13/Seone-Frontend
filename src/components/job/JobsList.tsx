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

    return (
        <div className={styles.container}>
            <motion.div
                className={styles.grid}
                variants={staggerContainer}
                initial="initial"
                animate="animate"
            >
                {items.map((job) => (
                    <motion.div
                        key={job.id}
                        className={styles.card}
                        variants={listItemVariants}
                        onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                    >
                        <div className={styles.cardHeader}>
                            <span className={styles.date}>
                                {new Date(job.created_at).toLocaleDateString()}
                            </span>
                            <span className={cn(styles.status, styles[job.status])}>
                                {job.status}
                            </span>
                        </div>
                        <div className={styles.cardBody}>
                            <h4 className={styles.jobId}>Job #{job.id.slice(0, 8)}</h4>
                            <div className={styles.meta}>
                                <span>{job.clip_count} clips</span>
                                {job.completed_at && (
                                    <span>• {new Date(job.completed_at).toLocaleTimeString()}</span>
                                )}
                            </div>
                        </div>
                        {['downloading', 'transcribing', 'analyzing', 'rendering'].includes(job.status) ? (
                            <div className={styles.progress}>
                                <div
                                    className={styles.progressBar}
                                    style={{ width: `${job.progress}%` }}
                                />
                            </div>
                        ) : null}
                    </motion.div>
                ))}
            </motion.div>

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
