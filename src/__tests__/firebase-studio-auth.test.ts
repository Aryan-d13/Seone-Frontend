import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/config/firebase';
import * as authService from '@/services/auth';
import { ensureFirebaseStudioAuth } from '@/features/editor/utils/firebaseStudioAuth';

describe('ensureFirebaseStudioAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(auth, { currentUser: null });
  });

  it('signs into Firebase with a backend custom token when no session exists', async () => {
    vi.spyOn(authService, 'fetchFirebaseCustomToken').mockResolvedValueOnce(
      'firebase-custom-token'
    );
    vi.mocked(signInWithCustomToken).mockImplementationOnce(async () => {
      Object.assign(auth, { currentUser: { uid: 'firebase-user' } });
      return { user: { uid: 'firebase-user' } } as never;
    });

    await expect(ensureFirebaseStudioAuth()).resolves.toBe(true);
    expect(authService.fetchFirebaseCustomToken).toHaveBeenCalledTimes(1);
    expect(signInWithCustomToken).toHaveBeenCalledWith(auth, 'firebase-custom-token');
  });

  it('skips token exchange when Firebase already has a session', async () => {
    Object.assign(auth, { currentUser: { uid: 'existing-user' } });
    const tokenSpy = vi.spyOn(authService, 'fetchFirebaseCustomToken');

    await expect(ensureFirebaseStudioAuth()).resolves.toBe(true);
    expect(tokenSpy).not.toHaveBeenCalled();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });
});
