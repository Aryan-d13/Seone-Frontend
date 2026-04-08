import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIP_DEBUG_QUERY_PARAM,
  CLIP_DEBUG_STORAGE_KEY,
  clipDebugLog,
  isClipDebugEnabled,
  registerClipDebugSnapshotProvider,
} from '@/features/editor/lib/clipStudioDebug';

describe('clip studio debug helper', () => {
  const originalLocation = window.location.href;

  beforeEach(() => {
    window.history.replaceState({}, '', '/studio/jobs/job-123/clips/1');
    window.localStorage.removeItem(CLIP_DEBUG_STORAGE_KEY);
    delete window.__SEONE_CLIP_DEBUG__;
    delete window.__SEONE_CLIP_DEBUG_BUFFER__;
    delete window.__SEONE_CLIP_DEBUG_SNAPSHOT__;
    delete window.__SEONE_CLIP_DEBUG_EXPORT__;
    delete window.__SEONE_CLIP_DEBUG_PROVIDERS__;
  });

  afterEach(() => {
    window.history.replaceState({}, '', originalLocation);
    window.localStorage.removeItem(CLIP_DEBUG_STORAGE_KEY);
    delete window.__SEONE_CLIP_DEBUG__;
    delete window.__SEONE_CLIP_DEBUG_BUFFER__;
    delete window.__SEONE_CLIP_DEBUG_SNAPSHOT__;
    delete window.__SEONE_CLIP_DEBUG_EXPORT__;
    delete window.__SEONE_CLIP_DEBUG_PROVIDERS__;
    vi.restoreAllMocks();
  });

  it('stays disabled by default and enables from query, storage, or window flag', () => {
    expect(isClipDebugEnabled(window)).toBe(false);

    window.history.replaceState(
      {},
      '',
      `/studio/jobs/job-123/clips/1?${CLIP_DEBUG_QUERY_PARAM}=1`
    );
    expect(isClipDebugEnabled(window)).toBe(true);

    window.history.replaceState({}, '', '/studio/jobs/job-123/clips/1');
    window.localStorage.setItem(CLIP_DEBUG_STORAGE_KEY, '1');
    expect(isClipDebugEnabled(window)).toBe(true);

    window.localStorage.removeItem(CLIP_DEBUG_STORAGE_KEY);
    window.__SEONE_CLIP_DEBUG__ = true;
    expect(isClipDebugEnabled(window)).toBe(true);
  });

  it('captures buffered events and exposes snapshot/export globals', () => {
    window.__SEONE_CLIP_DEBUG__ = true;
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const unregister = registerClipDebugSnapshotProvider('workspace', () => ({
      viewport: { clientWidth: 1280, clientHeight: 720 },
    }));

    const entry = clipDebugLog('workspace:fit:start', {
      reason: 'initial',
    });

    expect(entry).not.toBeNull();
    expect(window.__SEONE_CLIP_DEBUG_BUFFER__).toHaveLength(1);
    expect(window.__SEONE_CLIP_DEBUG_BUFFER__?.[0]?.event).toBe('workspace:fit:start');

    const snapshot = window.__SEONE_CLIP_DEBUG_SNAPSHOT__?.();
    expect(snapshot).toMatchObject({
      route: '/studio/jobs/job-123/clips/1',
      workspace: {
        viewport: { clientWidth: 1280, clientHeight: 720 },
      },
    });

    const exported = window.__SEONE_CLIP_DEBUG_EXPORT__?.();
    expect(exported).toMatchObject({
      route: '/studio/jobs/job-123/clips/1',
      buffer: [
        expect.objectContaining({
          event: 'workspace:fit:start',
        }),
      ],
      snapshot: expect.objectContaining({
        workspace: {
          viewport: { clientWidth: 1280, clientHeight: 720 },
        },
      }),
    });

    expect(consoleSpy).toHaveBeenCalled();
    unregister();
  });
});
