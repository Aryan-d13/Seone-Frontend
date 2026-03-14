'use client';

import { ReactNode, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Inspector } from './Inspector';
import { TopBar } from './TopBar';
import { ServiceBanner } from './ServiceBanner';
import { EditDropZone } from '@/components/job/EditDropZone';
import { useAppStore } from '@/stores/app';
import { useServiceConfig } from '@/hooks';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { isInspectorOpen } = useAppStore();

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

        {/* Inspector Panel */}
        <motion.aside
          className={styles.inspector}
          initial={false}
          animate={{
            width: isInspectorOpen ? 'var(--inspector-width)' : 0,
            opacity: isInspectorOpen ? 1 : 0,
          }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        >
          {isInspectorOpen && <Inspector />}
        </motion.aside>
      </div>

      {/* Plug & Edit Drop Zone — appears globally when a clip is dragged */}
      <EditDropZone />
    </div>
  );
}
