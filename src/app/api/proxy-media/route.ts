import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy route for media files.
 *
 * Fetches a video from the backend (server-side, no CORS) and streams it
 * back with permissive CORS + CORP headers so plug&edit (different origin
 * with COEP: require-corp) can fetch it for FFmpeg processing.
 *
 * Usage: GET /api/proxy-media?url=<encoded-media-url>
 */
export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');

    console.log('[proxy-media] Incoming request:', {
        url,
        origin: request.headers.get('origin'),
        referer: request.headers.get('referer'),
    });

    if (!url) {
        console.warn('[proxy-media] Missing url parameter');
        return NextResponse.json(
            { error: 'Missing "url" query parameter' },
            { status: 400 }
        );
    }

    try {
        console.log('[proxy-media] Fetching upstream:', url);
        const upstream = await fetch(url);

        console.log('[proxy-media] Upstream response:', {
            status: upstream.status,
            contentType: upstream.headers.get('Content-Type'),
            contentLength: upstream.headers.get('Content-Length'),
        });

        if (!upstream.ok) {
            console.error('[proxy-media] Upstream error:', upstream.status, upstream.statusText);
            return NextResponse.json(
                { error: `Upstream returned ${upstream.status}` },
                { status: upstream.status }
            );
        }

        const contentType =
            upstream.headers.get('Content-Type') || 'video/mp4';
        const contentLength = upstream.headers.get('Content-Length');

        const headers: Record<string, string> = {
            'Content-Type': contentType,
            // CORS: allow any origin to fetch this
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            // CORP: required because plug&edit enforces COEP (require-corp)
            // for SharedArrayBuffer/FFmpeg. Without this, COEP blocks the
            // response even when CORS headers are present.
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Cache-Control': 'public, max-age=3600',
        };

        if (contentLength) {
            headers['Content-Length'] = contentLength;
        }

        console.log('[proxy-media] Streaming response with headers:', headers);

        // Stream the response body through
        return new NextResponse(upstream.body, {
            status: 200,
            headers,
        });
    } catch (err) {
        console.error('[proxy-media] Fetch failed:', err);
        return NextResponse.json(
            { error: 'Failed to fetch upstream resource' },
            { status: 502 }
        );
    }
}

/** Handle CORS preflight */
export async function OPTIONS(request: NextRequest) {
    console.log('[proxy-media] OPTIONS preflight from:', request.headers.get('origin'));
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cross-Origin-Resource-Policy': 'cross-origin',
        },
    });
}
