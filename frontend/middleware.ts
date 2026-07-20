import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/lib/i18n/routing';

const PUBLIC = ['/login', '/register', '/otp', '/api/auth'];
const intlMiddleware = createMiddleware(routing);
const secret = new TextEncoder().encode(process.env.NEXT_SESSION_SECRET ?? 'fallback-dev-secret-32chars!!');

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const bare = pathname.replace(/^\/(en|fr|ar)/, '') || '/';
  const res = intlMiddleware(request) ?? NextResponse.next();
  if (PUBLIC.some(p => bare.startsWith(p)) || bare.startsWith('/api/')) return res;
  const token = request.cookies.get('app_session')?.value;
  if (!token) {
    const locale = pathname.split('/')[1] || 'en';
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }
  try {
    const { payload } = await jwtVerify(token, secret);
    res.headers.set('x-user-role', String(payload.role ?? ''));
    res.headers.set('x-user-id', String(payload.id ?? ''));
    return res;
  } catch {
    const locale = pathname.split('/')[1] || 'en';
    const url = new URL(`/${locale}/login`, request.url);
    url.searchParams.set('reason', 'session_expired');
    const r = NextResponse.redirect(url);
    r.cookies.delete('app_session');
    return r;
  }
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'] };
