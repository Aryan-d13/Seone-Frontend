'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore, useAppStore } from '@/stores';
import { Button } from '@/components/ui';
import styles from './TopBar.module.css';

export function TopBar() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { toggleSidebar, toggleInspector, isInspectorOpen } = useAppStore();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <header className={styles.topbar}>
      {/* Mobile Menu Button */}
      <button
        className={styles.menuButton}
        onClick={toggleSidebar}
        aria-label="Toggle menu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Logo */}
      <div className={styles.logo}>
        <span className="gradient-text">Seone</span>
      </div>

      {/* Spacer */}
      <div className={styles.spacer} />

      {/* Actions */}
      <div className={styles.actions}>
        {/* Inspector Toggle */}
        <button
          className={styles.iconButton}
          onClick={toggleInspector}
          aria-label="Toggle inspector"
          title={isInspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>

        {/* User Menu */}
        {user && (
          <div className={styles.userMenu}>
            <button className={styles.userButton}>
              {user.picture ? (
                <img src={user.picture} alt={user.name} className={styles.userAvatar} />
              ) : (
                <span className={styles.userInitial}>
                  {user.name.charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Logout */}
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </header>
  );
}
