'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Job } from '@/types';
import { useJobs } from '@/hooks/useJobs';
import { Button } from '@/components/ui/Button';
import { cn, formatLocalTime } from '@/lib/utils';
import { staggerContainer, listItemVariants } from '@/lib/animations';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './JobsList.module.css';

function formatDuration(seconds?: number | null) {
  if (seconds == null) return '-';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

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
      <div className={styles.list} data-testid="jobs-list-loading">
        <div className={styles.listHeader}>
          <span>Job ID</span>
          <span>Time</span>
          <span>Duration</span>
          <span>Output</span>
          <span>Status</span>
        </div>
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={styles.jobRowSkeleton}
            data-testid="jobs-list-loading-row"
          >
            <Skeleton className={styles.skeletonId} width="100px" height="14px" />
            <Skeleton width="60px" height="14px" />
            <Skeleton width="40px" height="14px" />
            <Skeleton width="80px" height="14px" />
            <Skeleton width="70px" height="14px" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <h3>No jobs found</h3>
        <p>Create your first job to get started</p>
        <Button onClick={() => router.push('/dashboard/new')}>Create Job</Button>
      </div>
    );
  }

  // Group items by date
  const groupedItems = items.reduce(
    (groups, job) => {
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
    },
    {} as Record<string, Job[]>
  );

  return (
    <div className={styles.container}>
      {Object.entries(groupedItems).map(([dateLabel, jobs]) => (
        <div key={dateLabel} className={styles.section}>
          <h3 className={styles.sectionTitle}>{dateLabel}</h3>
          <motion.div
            className={styles.list}
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            <div className={styles.listHeader}>
              <span>Job ID</span>
              <span>Time</span>
              <span>Duration</span>
              <span>Output</span>
              <span>Status</span>
            </div>
            {jobs.map(job => (
              <motion.div
                key={job.id}
                className={styles.jobRow}
                variants={listItemVariants}
                onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
              >
                <div className={styles.jobId}>#{job.id.slice(0, 8)}</div>
                <div className={styles.jobTime}>
                  <time dateTime={job.created_at}>
                    {formatLocalTime(job.created_at)}
                  </time>
                </div>
                <div className={styles.jobDuration}>
                  {formatDuration(job.processing_duration_seconds)}
                </div>
                <div className={styles.jobClips}>
                  {job.status === 'completed' || job.status === 'failed'
                    ? `${job.output?.clips?.length ?? 0} / ${job.clip_count} clips`
                    : `${job.clip_count} clips`}
                </div>
                <div className={cn(styles.statusLabel, styles[job.status])}>
                  <span className={styles.statusDot} />
                  {job.status}
                </div>

                {['downloading', 'transcribing', 'analyzing', 'rendering'].includes(
                  job.status
                ) && (
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
          <Button onClick={loadMore} variant="secondary" isLoading={isLoading}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
