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
    onFirebaseAuthChange: vi.fn(() => () => { }),
}));
