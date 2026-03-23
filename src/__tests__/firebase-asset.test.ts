import { getBlob, getDownloadURL } from 'firebase/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCanonicalAssetGcsPath, resolveFirebaseAssetBlobUrl, resolveFirebaseAssetUrl } from '@/features/editor/utils/firebaseAsset';
import { ensureFirebaseStudioAuth } from '@/features/editor/utils/firebaseStudioAuth';

vi.mock('@/features/editor/utils/firebaseStudioAuth', () => ({
  ensureFirebaseStudioAuth: vi.fn(async () => true),
}));

describe('firebaseAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses explicit gcs_path when present', () => {
    expect(
      getCanonicalAssetGcsPath(
        {
          type: 'image',
          path: 'logo.png',
          gcs_path: 'templates/chaturnath/assets/logo.png',
        },
        'logo_mark',
        'chaturnath/v1',
      ),
    ).toBe('templates/chaturnath/assets/logo.png');
  });

  it('derives legacy logo gcs_path from template id', () => {
    expect(
      getCanonicalAssetGcsPath(
        {
          type: 'image',
          path: 'E:\\Code\\Seone\\temp\\missing\\logo.png',
        },
        'logo_mark',
        'chaturnath/v1',
      ),
    ).toBe('templates/chaturnath/assets/logo.png');
  });

  it('resolves a Firebase download URL from gcs_path', async () => {
    const url = await resolveFirebaseAssetUrl(
      {
        type: 'image',
        path: 'logo.png',
        gcs_path: 'templates/chaturnath/assets/logo.png',
      },
      'logo_mark',
      'chaturnath/v1',
    );

    expect(getDownloadURL).toHaveBeenCalled();
    expect(url).toBe('https://firebase.mock/templates%2Fchaturnath%2Fassets%2Flogo.png');
  });

  it('returns null when Firebase resolution fails', async () => {
    vi.mocked(getDownloadURL).mockRejectedValueOnce(new Error('denied'));

    const url = await resolveFirebaseAssetUrl(
      {
        type: 'image',
        path: 'logo.png',
        gcs_path: 'templates/chaturnath/assets/logo.png',
      },
      'logo_mark',
      'chaturnath/v1',
    );

    expect(url).toBeNull();
  });

  it('resolves a Firebase blob URL from canonical asset refs', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:firebase-logo');

    const blobUrl = await resolveFirebaseAssetBlobUrl(
      {
        type: 'image',
        path: 'logo.png',
        gcs_path: 'templates/chaturnath/assets/logo.png',
      },
      'logo_mark',
      'chaturnath/v1',
    );

    expect(ensureFirebaseStudioAuth).toHaveBeenCalled();
    expect(getBlob).toHaveBeenCalled();
    expect(blobUrl).toBe('blob:firebase-logo');
  });

  it('prefers exact source_uri before falling back to gcs_path blob fetch', async () => {
    vi.mocked(getBlob)
      .mockRejectedValueOnce(new Error('missing source uri'))
      .mockResolvedValueOnce(new Blob(['logo'], { type: 'image/png' }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:firebase-source-uri');

    const blobUrl = await resolveFirebaseAssetBlobUrl(
      {
        type: 'image',
        path: 'logo.png',
        gcs_path: 'templates/chaturnath_v1/assets/logo.png',
        source_uri: 'templates/chaturnath/assets/logo.png',
      },
      'logo_mark',
      'chaturnath/v1',
    );

    expect(blobUrl).toBe('blob:firebase-source-uri');
    expect(vi.mocked(getBlob).mock.calls[0]?.[0]).toEqual({ fullPath: 'templates/chaturnath/assets/logo.png' });
    expect(vi.mocked(getBlob).mock.calls[1]?.[0]).toEqual({ fullPath: 'templates/chaturnath_v1/assets/logo.png' });
  });
});
