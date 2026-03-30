import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { fetchFirebaseCustomToken } from '@/services/auth';

let pendingStudioAuth: Promise<boolean> | null = null;

export async function ensureFirebaseStudioAuth(): Promise<boolean> {
  if ((auth as { currentUser?: unknown } | null)?.currentUser) {
    return true;
  }

  if (pendingStudioAuth) {
    return pendingStudioAuth;
  }

  pendingStudioAuth = (async () => {
    try {
      const customToken = await fetchFirebaseCustomToken();
      await signInWithCustomToken(auth, customToken);
      return true;
    } catch {
      return false;
    } finally {
      const hasCurrentUser = Boolean(
        (auth as { currentUser?: unknown } | null)?.currentUser
      );
      if (!hasCurrentUser) {
        pendingStudioAuth = null;
      }
    }
  })();

  return pendingStudioAuth;
}
