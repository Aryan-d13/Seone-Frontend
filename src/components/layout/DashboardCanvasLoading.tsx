'use client';

import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { SlowLoadNotice } from './SlowLoadNotice';
import styles from './DashboardCanvasLoading.module.css';

type DashboardCanvasLoadingVariant = 'overview' | 'newJob';

interface DashboardCanvasLoadingProps {
  variant?: DashboardCanvasLoadingVariant;
  className?: string;
}

export function DashboardCanvasLoading({
  variant = 'overview',
  className,
}: DashboardCanvasLoadingProps) {
  if (variant === 'newJob') {
    return <NewJobLoading className={className} />;
  }

  return <OverviewLoading className={className} />;
}

function OverviewLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn(styles.wrapper, className)}
      data-testid="dashboard-loading-overview"
    >
      <header className={styles.hero}>
        <h2 className={styles.label}>Preparing dashboard</h2>
        <Skeleton width="220px" height="40px" />
        <Skeleton width="340px" height="14px" />
      </header>

      <SlowLoadNotice className={styles.notice} />

      <section className={styles.statsGrid}>
        {[1, 2, 3, 4].map(card => (
          <div key={card} className={styles.statCard}>
            <Skeleton width="52px" height="28px" />
            <Skeleton width="92px" height="12px" />
          </div>
        ))}
      </section>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <Skeleton width="110px" height="12px" />
          <Skeleton width="80px" height="12px" />
          <Skeleton width="74px" height="12px" />
          <Skeleton width="74px" height="12px" />
        </div>

        {[1, 2, 3, 4, 5].map(row => (
          <div key={row} className={styles.tableRow}>
            <Skeleton width="92px" height="14px" />
            <Skeleton width="64px" height="14px" />
            <Skeleton width="58px" height="14px" />
            <Skeleton width="72px" height="14px" />
          </div>
        ))}
      </section>
    </div>
  );
}

function NewJobLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn(styles.wrapper, className)}
      data-testid="dashboard-loading-new-job"
    >
      <header className={styles.hero}>
        <h2 className={styles.label}>Preparing new job</h2>
        <Skeleton width="180px" height="40px" />
        <Skeleton width="300px" height="14px" />
      </header>

      <SlowLoadNotice className={styles.notice} />

      <div className={styles.newJobGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <Skeleton width="170px" height="22px" />
            <Skeleton width="250px" height="14px" />
          </div>

          <div className={styles.formStack}>
            <Skeleton width="100%" height="48px" />
            <Skeleton width="100%" height="88px" />

            <div className={styles.counterRow}>
              <Skeleton width="40px" height="40px" />
              <Skeleton width="48px" height="28px" />
              <Skeleton width="40px" height="40px" />
            </div>

            <Skeleton width="100%" height="44px" />
            <Skeleton width="100%" height="44px" />
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <Skeleton width="150px" height="22px" />
            <Skeleton width="220px" height="14px" />
          </div>

          <div className={styles.templateGrid}>
            {Array.from({ length: 12 }, (_, index) => (
              <div key={index} className={styles.templateItem}>
                <Skeleton width="52px" height="52px" variant="circle" />
                <Skeleton width="54px" height="10px" />
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.actionRow}>
        <Skeleton width="120px" height="48px" />
        <Skeleton width="160px" height="48px" />
      </div>
    </div>
  );
}
