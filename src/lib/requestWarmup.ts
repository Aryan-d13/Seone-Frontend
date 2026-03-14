const API_HEALTH_PATH = '/api/v1/health';
const WAKE_TIMEOUT_MS = 2000;
const PUBLIC_FILE_PATTERN = /\.[^/]+$/;
const EXCLUDED_METADATA_PATHS = new Set(['/favicon.ico', '/robots.txt', '/sitemap.xml']);
const PREFETCH_HEADERS = [
  'next-router-prefetch',
  'next-router-state-tree',
  'x-middleware-prefetch',
  'rsc',
] as const;

const WARMUP_DEBUG_HEADERS = {
  enabled: 'x-seone-warmup-debug',
  path: 'x-seone-warmup-path',
  targets: 'x-seone-warmup-targets',
  at: 'x-seone-warmup-at',
} as const;

export { API_HEALTH_PATH, WAKE_TIMEOUT_MS, WARMUP_DEBUG_HEADERS };

export interface WarmupRequestLike {
  method: string;
  headers: Headers;
  nextUrl: {
    pathname: string;
  };
}

export interface WarmupDebugPayload {
  eligible: true;
  path: string;
  targets: string[];
  at: string;
}

interface HeaderReader {
  get(name: string): string | null | undefined;
}

export function shouldWarmupRequest(request: WarmupRequestLike): boolean {
  const pathname = request.nextUrl.pathname;

  if (request.method != 'GET') return false;
  if (pathname.startsWith('/_next/')) return false;
  if (pathname.startsWith('/api/')) return false;
  if (EXCLUDED_METADATA_PATHS.has(pathname)) return false;
  if (PUBLIC_FILE_PATTERN.test(pathname)) return false;

  const purpose = request.headers.get('purpose')?.toLowerCase();
  if (purpose === 'prefetch') return false;

  if (PREFETCH_HEADERS.some(header => request.headers.has(header))) {
    return false;
  }

  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('text/html')) return false;

  const secFetchDest = request.headers.get('sec-fetch-dest');
  if (secFetchDest && secFetchDest !== 'document') return false;

  return true;
}

export function resolveWarmupTargets(env: NodeJS.ProcessEnv = process.env): string[] {
  const targets: string[] = [];

  const apiBaseUrl = env.NEXT_PUBLIC_API_URL?.trim();
  if (apiBaseUrl) {
    try {
      targets.push(new URL(API_HEALTH_PATH, apiBaseUrl).toString());
    } catch {
      // Ignore invalid API URLs so middleware never breaks navigation.
    }
  }

  const workerUrl = env.SEONE_WORKER_WAKE_URL?.trim();
  if (workerUrl) {
    try {
      new URL(workerUrl);
      targets.push(workerUrl);
    } catch {
      // Ignore invalid worker URLs so middleware never breaks navigation.
    }
  }

  return targets;
}

export function createWarmupDebugPayload(
  pathname: string,
  targets: string[],
  at: string = new Date().toISOString()
): WarmupDebugPayload {
  return {
    eligible: true,
    path: pathname,
    targets,
    at,
  };
}

export function applyWarmupDebugHeaders(
  headers: Headers,
  payload: WarmupDebugPayload
): void {
  headers.set(WARMUP_DEBUG_HEADERS.enabled, '1');
  headers.set(WARMUP_DEBUG_HEADERS.path, payload.path);
  headers.set(WARMUP_DEBUG_HEADERS.targets, JSON.stringify(payload.targets));
  headers.set(WARMUP_DEBUG_HEADERS.at, payload.at);
}

export function parseWarmupDebugPayload(headers: HeaderReader): WarmupDebugPayload | null {
  if (headers.get(WARMUP_DEBUG_HEADERS.enabled) !== '1') {
    return null;
  }

  const path = headers.get(WARMUP_DEBUG_HEADERS.path);
  const rawTargets = headers.get(WARMUP_DEBUG_HEADERS.targets) ?? '[]';
  const at = headers.get(WARMUP_DEBUG_HEADERS.at);

  if (!path || !at) {
    return null;
  }

  try {
    const parsedTargets = JSON.parse(rawTargets);
    const targets = Array.isArray(parsedTargets)
      ? parsedTargets.filter((value): value is string => typeof value === 'string')
      : [];

    return {
      eligible: true,
      path,
      targets,
      at,
    };
  } catch {
    return {
      eligible: true,
      path,
      targets: [],
      at,
    };
  }
}

export async function wakeTarget(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WAKE_TIMEOUT_MS);

  try {
    await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    // Best-effort warm-up only.
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function warmTargets(
  urls: string[],
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  await Promise.allSettled(urls.map(url => wakeTarget(url, fetchImpl)));
}
