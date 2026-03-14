import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import {
  applyWarmupDebugHeaders,
  createWarmupDebugPayload,
  resolveWarmupTargets,
  shouldWarmupRequest,
  warmTargets,
} from '@/lib/requestWarmup';

export function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!shouldWarmupRequest(request)) {
    return NextResponse.next();
  }

  const targets = resolveWarmupTargets();
  const requestHeaders = new Headers(request.headers);

  applyWarmupDebugHeaders(
    requestHeaders,
    createWarmupDebugPayload(request.nextUrl.pathname, targets)
  );

  if (targets.length > 0) {
    event.waitUntil(warmTargets(targets));
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\..*).*)',
  ],
};
