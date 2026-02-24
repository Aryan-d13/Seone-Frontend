'use client';

import { useServiceConfig } from '@/hooks';
import styles from './ServiceBanner.module.css';

export function ServiceBanner() {
  const { killSwitch, message } = useServiceConfig();

  if (!killSwitch) return null;

  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.icon}
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
          <span className={styles.title}>Service Temporarily Paused</span>
          <span className={styles.message}>
            {message ||
              'The system is in read-only mode for maintenance. You can view your history, but new jobs cannot be submitted at this time.'}
          </span>
        </div>
      </div>
    </div>
  );
}
