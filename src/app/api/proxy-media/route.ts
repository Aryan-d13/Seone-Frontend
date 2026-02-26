import { NextRequest, NextResponse } from 'next/server';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

/**
 * Media proxy route — 302 redirect strategy.
 *
 * Instead of streaming video through Cloud Run (which fails for large
 * files because Next.js standalone buffers the full response in memory),
 * we redirect the browser directly to the GCS signed URL. The browser
 * then fetches from GCS, which has CORS configured on the bucket.
 *
 * This uses zero Cloud Run memory and responds instantly.
 *
 * Usage: GET /api/proxy-media?url=<encoded-media-url>
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  console.log('[proxy-media] Redirect request:', {
    url: url?.slice(0, 80) + '...',
    origin: request.headers.get('origin'),
  });

  if (!url) {
    return NextResponse.json(
      { error: 'Missing "url" query parameter' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Return a 302 redirect to the actual GCS signed URL.
  // The browser will follow this and fetch directly from GCS.
  // GCS bucket must have CORS configured for this to work.
  return new NextResponse(null, {
    status: 302,
    headers: {
      ...CORS_HEADERS,
      Location: url,
    },
  });
}

/** Handle CORS preflight */
export async function OPTIONS(request: NextRequest) {
  console.log('[proxy-media] OPTIONS preflight from:', request.headers.get('origin'));
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
