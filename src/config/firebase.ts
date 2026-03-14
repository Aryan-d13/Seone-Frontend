// ============================================
// FIREBASE CONFIG
// Client SDK init for Firestore + Storage + Auth + RTDB
// ============================================

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const configuredStorageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();

function resolveStorageBucket(): string | undefined {
  if (configuredStorageBucket) {
    return configuredStorageBucket;
  }

  return projectId ? `${projectId}.firebasestorage.app` : undefined;
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId,
  storageBucket: resolveStorageBucket(),
};

// Singleton — avoid re-init during HMR
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);

// ---------- Firebase Auth Helpers ----------

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Trigger Google sign-in popup.
 * This is separate from the Seone JWT auth — it gives Firestore
 * Security Rules the `request.auth.token.email` they need.
 */
export async function signInWithFirebase(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Sign out of Firebase (does NOT affect the Seone JWT session).
 */
export async function signOutFirebase(): Promise<void> {
  await auth.signOut();
}

/**
 * Wait for the Firebase auth state to resolve.
 * Returns the current user or null.
 */
export function onFirebaseAuthChange(
  callback: (user: FirebaseUser | null) => void
): () => void {
  return onAuthStateChanged(auth, callback);
}

export type { FirebaseUser };
