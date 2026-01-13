'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores';
import { pageVariants, pageTransition, staggerContainer, listItemVariants } from '@/lib/animations';
import styles from './page.module.css';

export default function DashboardPage() {
    const router = useRouter();
    const { user } = useAuthStore();

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
            </section>

            {/* Quick Actions */}
            <motion.section
                className={styles.actions}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <Button size="lg" onClick={() => router.push('/dashboard/new')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="16" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    New Job
                </Button>
                <Button variant="secondary" size="lg" onClick={() => router.push('/dashboard/jobs')}>
                    View History
                </Button>
            </motion.section>

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
                    value="--"
                    trend={null}
                />
                <StatCard
                    icon="✅"
                    label="Completed"
                    value="--"
                    trend={null}
                />
                <StatCard
                    icon="⏳"
                    label="Processing"
                    value="--"
                    trend={null}
                />
                <StatCard
                    icon="📹"
                    label="Clips Generated"
                    value="--"
                    trend={null}
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
                <div className={styles.emptyState}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                    </svg>
                    <p>No jobs yet. Create your first job to get started!</p>
                    <Button onClick={() => router.push('/dashboard/new')}>Create First Job</Button>
                </div>
            </motion.section>
        </motion.div>
    );
}

function StatCard({
    icon,
    label,
    value,
    trend,
}: {
    icon: string;
    label: string;
    value: string;
    trend: string | null;
}) {
    return (
        <motion.div className={styles.statCard} variants={listItemVariants}>
            <span className={styles.statIcon}>{icon}</span>
            <div className={styles.statContent}>
                <span className={styles.statLabel}>{label}</span>
                <span className={styles.statValue}>{value}</span>
            </div>
            {trend && <span className={styles.statTrend}>{trend}</span>}
        </motion.div>
    );
}
