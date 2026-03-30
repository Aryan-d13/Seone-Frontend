import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock Firebase to prevent auth/invalid-api-key in CI (no env vars)
vi.mock('@/config/firebase', () => ({
  db: {},
  storage: {},
  auth: {},
  rtdb: {},
  signInWithFirebase: vi.fn(),
  signOutFirebase: vi.fn(),
  onFirebaseAuthChange: vi.fn(() => () => {}),
}));

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, path: string) => ({ fullPath: path })),
  getDownloadURL: vi.fn(
    async (storageRef: { fullPath: string }) =>
      `https://firebase.mock/${encodeURIComponent(storageRef.fullPath)}`
  ),
  getBlob: vi.fn(
    async (storageRef: { fullPath: string }) =>
      new Blob([storageRef.fullPath], { type: 'image/png' })
  ),
}));

vi.mock('firebase/auth', () => ({
  signInWithCustomToken: vi.fn(async () => ({ user: { uid: 'firebase-user' } })),
  onAuthStateChanged: vi.fn(() => () => {}),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(() => ({ setCustomParameters: vi.fn() })),
}));
