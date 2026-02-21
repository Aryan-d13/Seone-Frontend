'use client';

import { JobsList } from '@/components/job/JobsList';
import styles from './page.module.css';

export default function JobsPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Your Jobs</h1>
        <p className={styles.subtitle}>Manage and view your content generation history</p>
      </div>
      <JobsList />
    </div>
  );
}
