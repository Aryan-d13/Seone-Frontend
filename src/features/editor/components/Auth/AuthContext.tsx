/**
 * Auth context — Google sign-in with domain restriction.
 *
 * Wraps Firebase Auth into a React context so any component can access
 * the current user, sign in, or sign out.
 *
 * Domain gate: after Google sign-in, checks the user's email domain
 * against VITE_ALLOWED_DOMAINS. If not allowed, signs out and shows error.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, getAllowedDomains } from '../../lib/firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

function getDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || '';
}

function isAllowedIdentity(allowed: string[], email: string): boolean {
  const loweredEmail = email.toLowerCase();
  const domain = getDomain(loweredEmail);
  return allowed.includes(domain) || allowed.includes(loweredEmail);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      if (firebaseUser) {
        // Validate domain
        const allowed = getAllowedDomains();
        const domain = getDomain(firebaseUser.email || '');

        if (allowed.length > 0 && !isAllowedIdentity(allowed, firebaseUser.email || '')) {
          await firebaseSignOut(auth);
          setUser(null);
          setError(`Access denied. Only ${allowed.join(', ')} accounts are allowed.`);
        } else {
          setUser(firebaseUser);
          setError(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const allowed = getAllowedDomains();
      const domain = getDomain(result.user.email || '');

      if (allowed.length > 0 && !isAllowedIdentity(allowed, result.user.email || '')) {
        await firebaseSignOut(auth);
        setUser(null);
        setError(`Access denied. Only ${allowed.join(', ')} accounts are allowed.`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      if (!message.includes('popup-closed-by-user')) {
        setError(message);
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
