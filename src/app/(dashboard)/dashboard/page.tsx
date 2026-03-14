'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores';
import { useJobs } from '@/hooks/useJobs';
import {
  pageVariants,
  pageTransition,
  staggerContainer,
  listItemVariants,
} from '@/lib/animations';
import { cn, formatLocalDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './page.module.css';

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // 1. Fetch Data
  // Main fetch: Recent jobs + Total count
  const {
    items: recentJobs,
    total: totalJobs,
    isLoading: isLoadingRecent,
  } = useJobs({ pageSize: 5 });

  // Stats fetches: Completed & Failed counts
  const { total: completedJobs, isLoading: isLoadingCompleted } = useJobs({
    pageSize: 1,
    status: 'completed',
  });
  const { total: failedJobs, isLoading: isLoadingFailed } = useJobs({
    pageSize: 1,
    status: 'failed',
  });

  // Derived Stats
  const processingJobs = Math.max(0, totalJobs - completedJobs - failedJobs);
  const isLoadingProcessing = isLoadingRecent || isLoadingCompleted || isLoadingFailed;

  // Calculate "Recent Clips" (sum of clips in the last 5 jobs)
  const recentClipsCount = recentJobs.reduce(
    (acc, job) => acc + (job.clip_count || 0),
    0
  );

  return (
    <motion.div
      className={styles.dashboard}
      initial="initial"
      animate="animate"
      variants={pageVariants}
      transition={pageTransition}
    >
      {/* Welcome Section */}
      <section className={styles.welcome}>
        <div className={styles.welcomeHeader}>
          <motion.h1
            className={styles.greeting}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </motion.h1>
          <motion.p
            className={styles.subtitle}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Create AI-powered video clips from YouTube content
          </motion.p>
        </div>

        <motion.div
          className={styles.quickActions}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Button
            size="lg"
            onClick={() => router.push('/dashboard/new')}
            className={styles.primaryAction}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            New Job
          </Button>
        </motion.div>
      </section>

      {/* Stats Cards */}
      <motion.section
        className={styles.stats}
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <StatCard
          label="Total Jobs"
          value={
            isLoadingRecent ? (
              <Skeleton width="40px" height="24px" />
            ) : (
              totalJobs.toString()
            )
          }
        />
        <StatCard
          label="Completed"
          value={
            isLoadingCompleted ? (
              <Skeleton width="40px" height="24px" />
            ) : (
              completedJobs.toString()
            )
          }
        />
        <StatCard
          label="Processing"
          value={
            isLoadingProcessing ? (
              <Skeleton width="40px" height="24px" />
            ) : (
              processingJobs.toString()
            )
          }
        />
        <StatCard
          label="Recent Clips"
          value={
            isLoadingRecent ? (
              <Skeleton width="40px" height="24px" />
            ) : (
              recentClipsCount.toString()
            )
          }
        />
      </motion.section>

      {/* Recent Jobs Preview */}
      <motion.section
        className={styles.recent}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Output</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard/jobs')}
          >
            View All
          </Button>
        </div>

        {isLoadingRecent ? (
          <div className={styles.jobsList}>
            <div className={styles.jobsListHeader}>
              <span>Job ID</span>
              <span>Date</span>
              <span>Output</span>
              <span>Status</span>
            </div>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className={styles.jobRowSkeleton}>
                <Skeleton width="80px" height="14px" />
                <Skeleton width="60px" height="14px" />
                <Skeleton width="50px" height="14px" />
                <Skeleton width="70px" height="14px" />
              </div>
            ))}
          </div>
        ) : recentJobs.length > 0 ? (
          <div className={styles.jobsList}>
            <div className={styles.jobsListHeader}>
              <span>Job ID</span>
              <span>Date</span>
              <span>Output</span>
              <span>Status</span>
            </div>
            {recentJobs.map(job => (
              <motion.div
                key={job.id}
                className={styles.jobRow}
                variants={listItemVariants}
                onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
              >
                <span className={styles.jobId}>{job.id.slice(0, 8)}</span>
                <span className={styles.jobDate}>
                  {formatLocalDate(job.created_at, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className={styles.jobClips}>{job.clip_count} clips</span>
                <span className={cn(styles.statusLabel, styles[job.status])}>
                  <span className={styles.statusDot} />
                  {job.status}
                </span>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p>Awaiting generation.</p>
            <Button
              onClick={() => router.push('/dashboard/new')}
              variant="secondary"
              size="sm"
              className={styles.emptyAction}
            >
              Initialize First Sequence
            </Button>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}

function StatCard({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <motion.div className={styles.statCard} variants={listItemVariants}>
      <div className={styles.statContent}>
        <span className={styles.statValue}>{value}</span>
        <span className={styles.statLabel}>{label}</span>
      </div>
    </motion.div>
  );
}
