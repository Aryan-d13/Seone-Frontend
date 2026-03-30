'use client';

import { authFetch } from '@/services/auth';

export const PROTECTED_ASSET_AUTH_MESSAGE =
  'Your session is missing or expired. Sign in again to load template assets.';
export const PROTECTED_ASSET_LOAD_MESSAGE = 'Failed to load a protected template asset.';

type ProtectedAssetErrorCode = 'unauthorized' | 'load_failed';

interface CacheEntry {
  objectUrl?: string;
  promise?: Promise<string>;
  refCount: number;
}

export class ProtectedAssetLoadError extends Error {
  code: ProtectedAssetErrorCode;

  constructor(code: ProtectedAssetErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const cache = new Map<string, CacheEntry>();

function normalizeUrl(url: string): string {
  return url.trim();
}

function classifyProtectedAssetError(error: unknown): ProtectedAssetLoadError {
  if (error instanceof ProtectedAssetLoadError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('401')) {
    return new ProtectedAssetLoadError('unauthorized', PROTECTED_ASSET_AUTH_MESSAGE);
  }
  return new ProtectedAssetLoadError('load_failed', PROTECTED_ASSET_LOAD_MESSAGE);
}

async function fetchProtectedAssetObjectUrl(url: string): Promise<string> {
  try {
    const response = await authFetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new ProtectedAssetLoadError(
        'load_failed',
        `Protected asset request failed (${response.status})`
      );
    }
    const blob = await response.blob();
    if (!blob.size) {
      throw new ProtectedAssetLoadError('load_failed', PROTECTED_ASSET_LOAD_MESSAGE);
    }
    return URL.createObjectURL(blob);
  } catch (error) {
    throw classifyProtectedAssetError(error);
  }
}

export async function acquireProtectedAssetUrl(rawUrl: string): Promise<string> {
  const url = normalizeUrl(rawUrl);
  const existing = cache.get(url);
  if (existing?.objectUrl) {
    existing.refCount += 1;
    return existing.objectUrl;
  }
  if (existing?.promise) {
    existing.refCount += 1;
    return existing.promise;
  }

  const entry: CacheEntry = { refCount: 1 };
  entry.promise = fetchProtectedAssetObjectUrl(url)
    .then(objectUrl => {
      const current = cache.get(url);
      if (!current) {
        URL.revokeObjectURL(objectUrl);
        return objectUrl;
      }
      current.objectUrl = objectUrl;
      current.promise = undefined;
      if (current.refCount <= 0) {
        URL.revokeObjectURL(objectUrl);
        cache.delete(url);
      }
      return objectUrl;
    })
    .catch(error => {
      cache.delete(url);
      throw error;
    });
  cache.set(url, entry);
  return entry.promise;
}

export function releaseProtectedAssetUrl(rawUrl: string): void {
  const url = normalizeUrl(rawUrl);
  const entry = cache.get(url);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  if (entry.objectUrl) {
    URL.revokeObjectURL(entry.objectUrl);
    cache.delete(url);
    return;
  }
  if (!entry.promise) {
    cache.delete(url);
  }
}
