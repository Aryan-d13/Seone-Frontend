import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acquireProtectedAssetUrl,
  releaseProtectedAssetUrl,
} from '@/features/editor/lib/protectedAssetLoader';

const authFetchMock = vi.fn();

vi.mock('@/services/auth', () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

describe('protectedAssetLoader', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:protected-asset');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('loads and caches protected asset blobs via authFetch', async () => {
    authFetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['logo'], { type: 'image/png' }),
    });

    const first = await acquireProtectedAssetUrl('http://localhost:8000/api/v1/pages/admin/templates/chaturnath_v1/assets/logo_mark');
    const second = await acquireProtectedAssetUrl('http://localhost:8000/api/v1/pages/admin/templates/chaturnath_v1/assets/logo_mark');

    expect(first).toBe('blob:protected-asset');
    expect(second).toBe('blob:protected-asset');
    expect(authFetchMock).toHaveBeenCalledTimes(1);

    releaseProtectedAssetUrl('http://localhost:8000/api/v1/pages/admin/templates/chaturnath_v1/assets/logo_mark');
    expect(globalThis.URL.revokeObjectURL).not.toHaveBeenCalled();

    releaseProtectedAssetUrl('http://localhost:8000/api/v1/pages/admin/templates/chaturnath_v1/assets/logo_mark');
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:protected-asset');
  });

  it('classifies auth failures as unauthorized asset errors', async () => {
    authFetchMock.mockRejectedValue(new Error('API returned 401 for /api/v1/pages/admin/templates/chaturnath_v1/assets/logo_mark. Auth suspicion signaled.'));

    await expect(
      acquireProtectedAssetUrl('http://localhost:8000/api/v1/pages/admin/templates/chaturnath_v1/assets/logo_mark'),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
