'use client';

import { Skeleton } from '@/components/ui/Skeleton';
import { SlowLoadNotice } from './SlowLoadNotice';
import styles from './AuthBootstrapLoader.module.css';

export function AuthBootstrapLoader() {
  return (
    <div className={styles.screen} data-testid="auth-bootstrap-loader">
      <div className={styles.card}>
        <span className={styles.badge}>Seone</span>

        <div className={styles.copy}>
          <h1 className={styles.title}>Securing your workspace</h1>
          <p className={styles.subtitle}>
            Verifying your session before loading the dashboard.
          </p>
        </div>

        <div className={styles.preview}>
          <div className={styles.previewHeader}>
            <Skeleton width="160px" height="14px" />
            <Skeleton width="84px" height="14px" />
          </div>
          <Skeleton width="100%" height="54px" />
          <Skeleton width="100%" height="54px" />
          <Skeleton width="72%" height="14px" />
        </div>

        <SlowLoadNotice centered />
      </div>
    </div>
  );
}
