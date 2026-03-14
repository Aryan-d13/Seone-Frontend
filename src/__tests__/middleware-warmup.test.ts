import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';
import {
  API_HEALTH_PATH,
  WAKE_TIMEOUT_MS,
  WARMUP_DEBUG_HEADERS,
  parseWarmupDebugPayload,
  resolveWarmupTargets,
  shouldWarmupRequest,
  wakeTarget,
} from '@/lib/requestWarmup';

function createRequest(
  pathname: string,
  {
    method = 'GET',
    headers = {},
  }: {
    method?: string;
    headers?: Record<string, string>;
  } = {}
) {
  return new NextRequest(`https://seone-frontend-psi.vercel.app${pathname}`, {
    method,
    headers: {
      accept: 'text/html',
      'sec-fetch-dest': 'document',
      ...headers,
    },
  });
}

function createEvent() {
  const promises: Promise<unknown>[] = [];
  const waitUntil = vi.fn((promise: Promise<unknown>) => {
    promises.push(promise);
  });

  return {
    promises,
    event: { waitUntil } as Parameters<typeof middleware>[1],
    waitUntil,
  };
}

function readRequestHeaderOverride(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`);
}

function readWarmupDebugFromResponse(response: Response) {
  return parseWarmupDebugPayload({
    get(name: string) {
      return readRequestHeaderOverride(response, name);
    },
  });
}

describe('request warmup eligibility', () => {
  it('accepts direct document navigations including deep links', () => {
    expect(shouldWarmupRequest(createRequest('/'))).toBe(true);
    expect(shouldWarmupRequest(createRequest('/dashboard/jobs/job-123'))).toBe(true);
  });

  it('skips internal, asset, and prefetch requests', () => {
    expect(shouldWarmupRequest(createRequest('/_next/static/chunk.js'))).toBe(false);
    expect(shouldWarmupRequest(createRequest('/api/proxy-media'))).toBe(false);
    expect(shouldWarmupRequest(createRequest('/favicon.ico'))).toBe(false);
    expect(shouldWarmupRequest(createRequest('/poster.png'))).toBe(false);
    expect(
      shouldWarmupRequest(
        createRequest('/dashboard', { headers: { purpose: 'prefetch' } })
      )
    ).toBe(false);
    expect(
      shouldWarmupRequest(createRequest('/dashboard', { headers: { rsc: '1' } }))
    ).toBe(false);
  });
});

describe('resolveWarmupTargets', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds both API and worker targets when configured', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com');
    vi.stubEnv('SEONE_WORKER_WAKE_URL', 'https://worker.example.com');

    expect(resolveWarmupTargets()).toEqual([
      `https://api.example.com${API_HEALTH_PATH}`,
      'https://worker.example.com',
    ]);
  });

  it('skips missing targets independently', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    vi.stubEnv('SEONE_WORKER_WAKE_URL', 'https://worker.example.com');
    expect(resolveWarmupTargets()).toEqual(['https://worker.example.com']);

    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com');
    vi.stubEnv('SEONE_WORKER_WAKE_URL', '');
    expect(resolveWarmupTargets()).toEqual([`https://api.example.com${API_HEALTH_PATH}`]);
  });
});

describe('wakeTarget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts after the timeout without throwing', async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const wakePromise = wakeTarget(
      'https://worker.example.com',
      fetchMock as typeof fetch
    );
    await vi.advanceTimersByTimeAsync(WAKE_TIMEOUT_MS);
    await wakePromise;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedSignal?.aborted).toBe(true);
  });
});

describe('middleware warmup dispatch', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com');
    vi.stubEnv('SEONE_WORKER_WAKE_URL', 'https://worker.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns next immediately, stamps debug metadata, and schedules both warmups once', async () => {
    const resolvers: Array<() => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>(resolve => {
          resolvers.push(() => resolve(new Response(null, { status: 204 })));
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { event, promises, waitUntil } = createEvent();
    const response = middleware(createRequest('/dashboard/new'), event);
    const payload = readWarmupDebugFromResponse(response);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      `https://api.example.com${API_HEALTH_PATH}`,
      'https://worker.example.com',
    ]);
    expect(response.headers.get('x-middleware-override-headers')).toContain(
      WARMUP_DEBUG_HEADERS.enabled
    );
    expect(payload).toMatchObject({
      eligible: true,
      path: '/dashboard/new',
      targets: [
        `https://api.example.com${API_HEALTH_PATH}`,
        'https://worker.example.com',
      ],
    });

    resolvers.forEach(resolve => resolve());
    await Promise.all(promises);
  });

  it('attaches debug metadata for direct deep links', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);

    const { event } = createEvent();
    const response = middleware(createRequest('/dashboard/jobs/job-123'), event);
    const payload = readWarmupDebugFromResponse(response);

    expect(payload?.path).toBe('/dashboard/jobs/job-123');
  });

  it('skips warmups and debug metadata for ineligible requests', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { event, waitUntil } = createEvent();
    const response = middleware(createRequest('/_next/static/chunk.js'), event);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(waitUntil).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readWarmupDebugFromResponse(response)).toBeNull();
  });

  it('includes only the API target when the worker URL is missing', () => {
    vi.stubEnv('SEONE_WORKER_WAKE_URL', '');
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);

    const { event } = createEvent();
    const response = middleware(createRequest('/dashboard'), event);

    expect(readWarmupDebugFromResponse(response)?.targets).toEqual([
      `https://api.example.com${API_HEALTH_PATH}`,
    ]);
  });

  it('includes only the worker target when the API URL is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);

    const { event } = createEvent();
    const response = middleware(createRequest('/dashboard'), event);

    expect(readWarmupDebugFromResponse(response)?.targets).toEqual([
      'https://worker.example.com',
    ]);
  });

  it('swallows warmup failures without blocking the response', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('wake failed')));
    vi.stubGlobal('fetch', fetchMock);

    const { event, promises, waitUntil } = createEvent();
    const response = middleware(createRequest('/dashboard'), event);

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(waitUntil).toHaveBeenCalledTimes(1);

    await Promise.all(promises);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
