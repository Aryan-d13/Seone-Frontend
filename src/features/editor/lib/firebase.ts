import { GoogleAuthProvider } from 'firebase/auth';
import { auth, db, storage } from '@/config/firebase';
import { config } from '@/lib/config';

export { auth, db, storage };

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function getAllowedDomains(): string[] {
  return config.auth.allowedDomain
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
}
