'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuthStore, useAppStore } from '@/stores';
import { cn } from '@/lib/utils';
import styles from './Sidebar.module.css';

// Navigation items
const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: 'New Job',
    href: '/dashboard/new',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  {
    label: 'Jobs History',
    href: '/dashboard/jobs',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 8v4l3 3" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    label: 'Admin',
    href: process.env.NEXT_PUBLIC_TEMPLATE_BUILDER_URL || 'http://localhost:5173',
    external: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M8 10h8" />
        <path d="M8 14h5" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { isSidebarOpen, setSidebarOpen } = useAppStore();

  return (
    <>
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <motion.aside
        className={cn(styles.sidebar, isSidebarOpen && styles.open)}
        initial={false}
      >
        {/* Logo */}
        <div className={styles.logo}>
          <span className="gradient-text">Seone</span>
        </div>

        {/* Navigation */}
        <nav className={styles.nav}>
          {navItems.map(item => {
            const isActive =
              !item.external &&
              (pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href)));

            const linkProps = item.external
              ? {
                  href: item.href,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  onClick: () => setSidebarOpen(false),
                }
              : {
                  href: item.href,
                  onClick: () => setSidebarOpen(false),
                };

            const LinkComponent = item.external ? 'a' : Link;

            return (
              <LinkComponent
                key={item.href}
                {...linkProps}
                className={cn(styles.navItem, isActive && styles.active)}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
                {isActive && (
                  <motion.div
                    className={styles.activeIndicator}
                    layoutId="activeNav"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </LinkComponent>
            );
          })}
        </nav>

        {/* User Section */}
        <div className={styles.user}>
          {user && (
            <>
              <div className={styles.avatar}>
                {user.picture ? (
                  <Image
                    src={user.picture}
                    alt={user.name}
                    width={40}
                    height={40}
                    unoptimized
                  />
                ) : (
                  <span>{user.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className={styles.userInfo}>
                <span className={styles.userName}>{user.name}</span>
                <span className={styles.userEmail}>{user.email}</span>
              </div>
            </>
          )}
        </div>
      </motion.aside>
    </>
  );
}
