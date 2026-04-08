import { useEffect, useState } from 'react';

export const CLIP_DEBUG_PREFIX = '[CLIP:debug]';
export const CLIP_DEBUG_QUERY_PARAM = 'clipDebug';
export const CLIP_DEBUG_STORAGE_KEY = 'seone:clip-debug';
const CLIP_DEBUG_BUFFER_LIMIT = 200;
const CLIP_DEBUG_POLL_MS = 500;

export interface ClipDebugLogEntry {
  at: string;
  route: string;
  event: string;
  payload: unknown;
}

type ClipDebugSnapshotProvider = () => unknown;

declare global {
  interface Window {
    __SEONE_CLIP_DEBUG__?: boolean;
    __SEONE_CLIP_DEBUG_BUFFER__?: ClipDebugLogEntry[];
    __SEONE_CLIP_DEBUG_SNAPSHOT__?: () => Record<string, unknown>;
    __SEONE_CLIP_DEBUG_EXPORT__?: () => Record<string, unknown>;
    __SEONE_CLIP_DEBUG_PROVIDERS__?: Record<string, ClipDebugSnapshotProvider>;
  }
}

function getWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

function getCurrentRoute(target: Window): string {
  return `${target.location.pathname}${target.location.search}`;
}

function toSerializable(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return {
      __nonSerializable: String(error),
      fallback: String(value),
    };
  }
}

function getBuffer(target: Window): ClipDebugLogEntry[] {
  if (!Array.isArray(target.__SEONE_CLIP_DEBUG_BUFFER__)) {
    target.__SEONE_CLIP_DEBUG_BUFFER__ = [];
  }
  return target.__SEONE_CLIP_DEBUG_BUFFER__;
}

function getProviders(target: Window): Record<string, ClipDebugSnapshotProvider> {
  if (!target.__SEONE_CLIP_DEBUG_PROVIDERS__) {
    target.__SEONE_CLIP_DEBUG_PROVIDERS__ = {};
  }
  return target.__SEONE_CLIP_DEBUG_PROVIDERS__;
}

function readQueryFlag(target: Window): boolean {
  try {
    return new URLSearchParams(target.location.search).get(CLIP_DEBUG_QUERY_PARAM) === '1';
  } catch {
    return false;
  }
}

function readStorageFlag(target: Window): boolean {
  try {
    return target.localStorage.getItem(CLIP_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isClipDebugEnabled(target: Window | null = getWindow()): boolean {
  if (!target) return false;
  return target.__SEONE_CLIP_DEBUG__ === true || readQueryFlag(target) || readStorageFlag(target);
}

function buildSnapshot(target: Window): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    capturedAt: new Date().toISOString(),
    route: getCurrentRoute(target),
  };

  for (const [name, provider] of Object.entries(getProviders(target))) {
    try {
      snapshot[name] = toSerializable(provider());
    } catch (error) {
      snapshot[name] = {
        error: error instanceof Error ? error.message : 'Snapshot provider failed',
      };
    }
  }

  return snapshot;
}

function buildExportPayload(target: Window): Record<string, unknown> {
  return {
    exportedAt: new Date().toISOString(),
    route: getCurrentRoute(target),
    buffer: [...getBuffer(target)],
    snapshot: buildSnapshot(target),
  };
}

function installGlobals(target: Window): void {
  getBuffer(target);
  getProviders(target);

  target.__SEONE_CLIP_DEBUG_SNAPSHOT__ = () => {
    const snapshot = buildSnapshot(target);
    console.log(`${CLIP_DEBUG_PREFIX} snapshot\n${JSON.stringify(snapshot, null, 2)}`);
    return snapshot;
  };

  target.__SEONE_CLIP_DEBUG_EXPORT__ = () => {
    const payload = buildExportPayload(target);
    console.log(`${CLIP_DEBUG_PREFIX} export\n${JSON.stringify(payload, null, 2)}`);
    return payload;
  };
}

export function clipDebugLog(event: string, payload: unknown = null): ClipDebugLogEntry | null {
  const target = getWindow();
  if (!target || !isClipDebugEnabled(target)) {
    return null;
  }

  installGlobals(target);
  const entry: ClipDebugLogEntry = {
    at: new Date().toISOString(),
    route: getCurrentRoute(target),
    event,
    payload: toSerializable(payload),
  };

  const buffer = getBuffer(target);
  buffer.push(entry);
  if (buffer.length > CLIP_DEBUG_BUFFER_LIMIT) {
    buffer.splice(0, buffer.length - CLIP_DEBUG_BUFFER_LIMIT);
  }

  console.log(`${CLIP_DEBUG_PREFIX} ${event}`, entry);
  return entry;
}

export function registerClipDebugSnapshotProvider(
  name: string,
  provider: ClipDebugSnapshotProvider
): () => void {
  const target = getWindow();
  if (!target) {
    return () => undefined;
  }

  const providers = getProviders(target);
  providers[name] = provider;
  installGlobals(target);

  return () => {
    delete providers[name];
    installGlobals(target);
  };
}

export function useClipDebugEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => isClipDebugEnabled());

  useEffect(() => {
    const target = getWindow();
    if (!target) return undefined;

    const sync = () => {
      const nextEnabled = isClipDebugEnabled(target);
      setEnabled(previous => (previous === nextEnabled ? previous : nextEnabled));
      if (nextEnabled) {
        installGlobals(target);
      }
    };

    sync();
    const intervalId = target.setInterval(sync, CLIP_DEBUG_POLL_MS);
    const handleStorage = () => sync();
    target.addEventListener('storage', handleStorage);

    return () => {
      target.clearInterval(intervalId);
      target.removeEventListener('storage', handleStorage);
    };
  }, []);

  return enabled;
}
