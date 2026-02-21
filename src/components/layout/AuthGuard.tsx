'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
}

/**
 * AuthGuard component that handles authentication redirects
 * - If requireAuth=true and user is not authenticated -> redirect to login
 * - If requireAuth=false (login page) and user is authenticated -> redirect to dashboard
 */
export function AuthGuard({ children, requireAuth = true, redirectTo }: AuthGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (isLoading) return;

    if (requireAuth && !isAuthenticated) {
      router.replace(redirectTo || '/login');
    } else if (!requireAuth && isAuthenticated) {
      router.replace(redirectTo || '/dashboard');
    }
  }, [isAuthenticated, isLoading, requireAuth, redirectTo, router]);

  // Show nothing while checking auth
  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-spinner" />
      </div>
    );
  }

  // Don't render children if redirect is needed
  if (requireAuth && !isAuthenticated) {
    return null;
  }

  if (!requireAuth && isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
