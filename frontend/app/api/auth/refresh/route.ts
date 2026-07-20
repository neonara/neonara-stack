import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { djangoRefresh } from '@/lib/api/auth';
const secret = new TextEncoder().encode(process.env.NEXT_SESSION_SECRET ?? 'fallback-dev-secret-32chars!!');
export async function POST(request: NextRequest) {
  const token = request.cookies.get('app_session')?.value;
  if (!token) return NextResponse.json({ detail: 'No session' }, { status: 401 });
  try {
    const { payload } = await jwtVerify(token, secret);
    const { access, refresh } = await djangoRefresh(String(payload.djangoRefresh ?? ''));
    const newToken = await new SignJWT({ ...payload, djangoAccessToken: access, djangoRefresh: refresh })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
    const res = NextResponse.json({ ok: true });
    res.cookies.set('app_session', newToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return res;
  } catch {
    const res = NextResponse.json({ detail: 'Refresh failed' }, { status: 401 });
    res.cookies.delete('app_session'); return res;
  }
}
