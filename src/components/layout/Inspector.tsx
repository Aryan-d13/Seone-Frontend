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
                        <div className={styles.detailRow}>
                            <p className={styles.label}>Active Job</p>
                            <p className={styles.value}>{activeJobId}</p>
                        </div>
                    </div>
                ) : (
                    <div className={styles.empty}>
                        <div className={styles.emptyIcon}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
                                <path d="M10 12h4" />
                                <path d="M12 10v4" />
                            </svg>
                        </div>
                        <p className={styles.emptyText}>Select a job to view details</p>
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div className={styles.section}>
                <h4 className={styles.sectionTitle}>Quick Actions</h4>
                <div className={styles.sectionContent}>
                    <button className={styles.actionButton}>
                        <div className={styles.actionIcon}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                        </div>
                        <span>New Job</span>
                    </button>
                </div>
            </div>

            <div className={styles.section}>
                <h4 className={styles.sectionTitle}>Recent Activity</h4>
                <div className={styles.sectionContent}>
                    <p className={styles.noActivity}>No recent activity</p>
                </div>
            </div>
        </div>
    );
}
