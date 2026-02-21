import { GoogleOAuthProvider } from '@/components/layout/GoogleOAuthProvider';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <GoogleOAuthProvider>{children}</GoogleOAuthProvider>;
}
