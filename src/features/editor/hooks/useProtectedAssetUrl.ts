'use client';

import { useEffect, useState } from 'react';

import {
  acquireProtectedAssetUrl,
  ProtectedAssetLoadError,
  releaseProtectedAssetUrl,
} from '../lib/protectedAssetLoader';
import { isProtectedAssetUrl } from '../utils/assetPreview';

export function useProtectedAssetUrl(rawUrl: string | null | undefined): {
  resolvedUrl: string | null;
  error: ProtectedAssetLoadError | null;
} {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [error, setError] = useState<ProtectedAssetLoadError | null>(null);

  useEffect(() => {
    const normalized = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!normalized) {
      setResolvedUrl(null);
      setError(null);
      return;
    }
    if (!isProtectedAssetUrl(normalized)) {
      setResolvedUrl(normalized);
      setError(null);
      return;
    }

    let active = true;
    setResolvedUrl(null);
    setError(null);

    acquireProtectedAssetUrl(normalized)
      .then(nextUrl => {
        if (!active) return;
        setResolvedUrl(nextUrl);
      })
      .catch(nextError => {
        if (!active) return;
        setError(nextError instanceof ProtectedAssetLoadError ? nextError : null);
        setResolvedUrl(null);
      });

    return () => {
      active = false;
      releaseProtectedAssetUrl(normalized);
    };
  }, [rawUrl]);

  return { resolvedUrl, error };
}
