import { NextResponse, type NextRequest } from 'next/server';
import { isTokenActive, readTokenClaims } from './lib/jwt';
import { loginPath } from './lib/navigation';
import { SESSION_COOKIE } from './lib/session-cookie';

const PROTECTED_PREFIXES = ['/cart', '/checkout', '/orders'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function contentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isProtected(pathname)) {
    const claims = readTokenClaims(request.cookies.get(SESSION_COOKIE)?.value);
    if (!isTokenActive(claims)) {
      return NextResponse.redirect(
        new URL(loginPath(`${pathname}${search}`), request.url),
      );
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    '/cart/:path*',
    '/checkout/:path*',
    '/orders/:path*',
    {
      source: '/((?!_next/static|_next/image|icon.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
