'use client';

import { ReactNode, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ServiceBanner } from './ServiceBanner';
import { EditDropZone } from '@/components/job/EditDropZone';
import { useServiceConfig } from '@/hooks';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  // Subscribe to Firebase RTDB kill switch — runs once on mount
  useEffect(() => {
    const unsubscribe = useServiceConfig.getState().subscribe();
    return unsubscribe;
  }, []);

  return (
    <div className={styles.shell}>
      <ServiceBanner />
      {/* Top Bar */}
      <TopBar />

      {/* Main Content Area */}
      <div className={styles.content}>
        {/* Sidebar */}
        <Sidebar />

        {/* Main Canvas */}
        <main className={styles.canvas}>{children}</main>
      </div>

      {/* Plug & Edit Drop Zone — appears globally when a clip is dragged */}
      <EditDropZone />
    </div>
  );
}
