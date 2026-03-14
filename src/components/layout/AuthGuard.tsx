'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores';
import { AuthBootstrapLoader } from './AuthBootstrapLoader';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
}

/**
 * AuthGuard component that handles authentication redirects.
 * - If requireAuth=true and user is not authenticated -> redirect to login.
 * - If requireAuth=false (login page) and user is authenticated -> redirect to dashboard.
 * - If a cached protected session exists, render immediately while /auth/me revalidates.
 */
export function AuthGuard({ children, requireAuth = true, redirectTo }: AuthGuardProps) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, initialize } = useAuthStore();

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

  const hasDisplaySession = requireAuth && isLoading && isAuthenticated && Boolean(user);

  if (isLoading) {
    if (hasDisplaySession) {
      return <>{children}</>;
    }

    return <AuthBootstrapLoader />;
  }

  if (requireAuth && !isAuthenticated) {
    return null;
  }

  if (!requireAuth && isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
