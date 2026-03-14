import { GoogleOAuthProvider } from '@/components/layout/GoogleOAuthProvider';
import { AuthGuard } from '@/components/layout/AuthGuard';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider>
      <AuthGuard requireAuth={false} redirectTo="/dashboard">
        {children}
      </AuthGuard>
    </GoogleOAuthProvider>
  );
}
