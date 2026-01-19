'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores';
import { useJobs } from '@/hooks/useJobs';
import { pageVariants, pageTransition, staggerContainer, listItemVariants } from '@/lib/animations';
import { cn } from '@/lib/utils';
import styles from './page.module.css';

export default function DashboardPage() {
    const router = useRouter();
    const { user } = useAuthStore();

    // 1. Fetch Data
    // Main fetch: Recent jobs + Total count
    const { items: recentJobs, total: totalJobs, isLoading: isLoadingRecent } = useJobs({ pageSize: 5 });

    // Stats fetches: Completed & Failed counts
    const { total: completedJobs } = useJobs({ pageSize: 1, status: 'completed' });
    const { total: failedJobs } = useJobs({ pageSize: 1, status: 'failed' });

    // Derived Stats
    const processingJobs = Math.max(0, totalJobs - completedJobs - failedJobs);

    // Calculate "Recent Clips" (sum of clips in the last 5 jobs)
    const recentClipsCount = recentJobs.reduce((acc, job) => acc + (job.clip_count || 0), 0);

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
                    <Button size="lg" onClick={() => router.push('/dashboard/new')} className={styles.primaryAction}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                    icon="🎬"
                    label="Total Jobs"
                    value={isLoadingRecent ? '-' : totalJobs.toString()}
                />
                <StatCard
                    icon="✅"
                    label="Completed"
                    value={isLoadingRecent ? '-' : completedJobs.toString()}
                />
                <StatCard
                    icon="⏳"
                    label="Processing"
                    value={isLoadingRecent ? '-' : processingJobs.toString()}
                />
                <StatCard
                    icon="✂️"
                    label="Recent Clips"
                    value={isLoadingRecent ? '-' : recentClipsCount.toString()}
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
                    <h2 className={styles.sectionTitle}>Recent Jobs</h2>
                    <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/jobs')}>View All</Button>
                </div>

                {isLoadingRecent ? (
                    <div className={styles.loadingState}>
                        <div className={styles.spinner} />
                    </div>
                ) : recentJobs.length > 0 ? (
                    <div className={styles.jobsGrid}>
                        {recentJobs.map((job) => (
                            <motion.div
                                key={job.id}
                                className={styles.jobCard}
                                variants={listItemVariants}
                                onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                                whileHover={{ y: -2, transition: { duration: 0.2 } }}
                            >
                                <div className={styles.jobHeader}>
                                    <span className={styles.jobId}>#{job.id.slice(0, 8)}</span>
                                    <span className={cn(styles.status, styles[job.status])}>
                                        {job.status}
                                    </span>
                                </div>
                                <div className={styles.jobMeta}>
                                    <span>{new Date(job.created_at).toLocaleDateString()}</span>
                                    <span>•</span>
                                    <span>{job.clip_count} clips</span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <path d="M21 15l-5-5L5 21" />
                            </svg>
                        </div>
                        <p>No jobs yet. Create your first job to get started!</p>
                        <Button onClick={() => router.push('/dashboard/new')}>Create First Job</Button>
                    </div>
                )}
            </motion.section>
        </motion.div>
    );
}

function StatCard({
    icon,
    label,
    value,
}: {
    icon: string;
    label: string;
    value: string;
}) {
    return (
        <motion.div className={styles.statCard} variants={listItemVariants}>
            <div className={styles.statIconWrapper}>{icon}</div>
            <div className={styles.statContent}>
                <span className={styles.statValue}>{value}</span>
                <span className={styles.statLabel}>{label}</span>
            </div>
        </motion.div>
    );
}
