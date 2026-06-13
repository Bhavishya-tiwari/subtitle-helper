import { NextRequest, NextResponse } from 'next/server';

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (origin.startsWith('chrome-extension://')) return true;
  if (process.env.NODE_ENV === 'development') return true;
  return false;
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    if (isAllowedOrigin(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin || '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    return response;
  }

  const response = NextResponse.next();
  if (isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin || '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return response;
}

export const config = {
  matcher: '/api/:path*'
};
