import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    return new NextResponse('Site under maintainance', {
        status: 500,
    });
}

export const config = {
    matcher: '/:path*',
};
