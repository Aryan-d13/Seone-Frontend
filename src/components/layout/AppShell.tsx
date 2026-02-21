'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Inspector } from './Inspector';
import { TopBar } from './TopBar';
import { useAppStore } from '@/stores/app';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { isInspectorOpen } = useAppStore();

  return (
    <div className={styles.shell}>
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
    </div>
  );
}
