import { NextRequest, NextResponse } from 'next/server';
import { djangoLogin } from '@/lib/api/auth';
import { SignJWT } from 'jose';
const secret = new TextEncoder().encode(process.env.NEXT_SESSION_SECRET ?? 'fallback-dev-secret-32chars!!');
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    const { access, refresh } = await djangoLogin(email, password);
    const parts = access.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const token = await new SignJWT({ id: payload.user_id, email: payload.email, role: payload.role ?? 'candidate', tenantSchema: payload.tenant_schema ?? '', djangoAccessToken: access, djangoRefresh: refresh })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
    const res = NextResponse.json({ role: payload.role });
    res.cookies.set('app_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return res;
  } catch (e: unknown) {
    return NextResponse.json({ detail: e instanceof Error ? e.message : 'Login failed' }, { status: 401 });
  }
}
