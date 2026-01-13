'use client';

import { useAppStore } from '@/stores';
import styles from './Inspector.module.css';

export function Inspector() {
    const { activeJobId } = useAppStore();

    return (
        <div className={styles.inspector}>
            {/* Header */}
            <div className={styles.header}>
                <h3 className={styles.title}>Inspector</h3>
            </div>

            {/* Content */}
            <div className={styles.content}>
                {activeJobId ? (
                    <div className={styles.jobDetails}>
                        <p className={styles.label}>Active Job</p>
                        <p className={styles.value}>{activeJobId}</p>
                    </div>
                ) : (
                    <div className={styles.empty}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <p>Select a job to view details</p>
                    </div>
                )}
            </div>

            {/* Placeholder sections for future */}
            <div className={styles.section}>
                <h4 className={styles.sectionTitle}>Quick Actions</h4>
                <div className={styles.sectionContent}>
                    <button className={styles.actionButton}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        New Job
                    </button>
                </div>
            </div>

            <div className={styles.section}>
                <h4 className={styles.sectionTitle}>Recent Activity</h4>
                <div className={styles.sectionContent}>
                    <p className={styles.emptyText}>No recent activity</p>
                </div>
            </div>
        </div>
    );
}
