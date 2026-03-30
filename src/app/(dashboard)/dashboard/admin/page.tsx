'use client';

import TemplateAdminPanel from '@/features/editor/admin/TemplateAdminPanel';
import { useAuthStore } from '@/stores';
import styles from './page.module.css';

export default function AdminPage() {
  const { user } = useAuthStore();

  return (
    <div className={styles.page}>
      <TemplateAdminPanel userEmail={user?.email ?? null} />
    </div>
  );
}
